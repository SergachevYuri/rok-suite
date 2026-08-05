import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';

export type UnitType = 'infantry' | 'archer' | 'cavalry' | 'leadership';
export type RoleType = 'rally' | 'garrison';
export type ApplicationStatus = 'pending' | 'reviewed' | 'approved' | 'rejected';

export interface LeaderApplicationRoleRow {
  id: string;
  application_id: string;
  position: number;
  unit_type: UnitType;
  role_type: RoleType;
  primary_commander_id: string | null;
  primary_commander_name: string | null;
  secondary_commander_id: string | null;
  secondary_commander_name: string | null;
  primary_gear_url: string | null;
  primary_armaments_url: string | null;
  primary_skills_url: string | null;
  secondary_gear_url: string | null;
  secondary_armaments_url: string | null;
  secondary_skills_url: string | null;
}

export interface LeaderApplicationRow {
  id: string;
  created_at: string;
  kingdom: string;
  name: string;
  gov_id: string;
  discord: string | null;
  notes: string | null;
  locale: string | null;
  status: ApplicationStatus;
  rating: number | null;
  /** Officer/in-game readiness of this lead's build. Separate from status. */
  readiness: ReadinessLevel | null;
  /** Optional short detail on the readiness (e.g. "missing ~50 mats for ring"). */
  readiness_note: string | null;
  leader_application_roles: LeaderApplicationRoleRow[];
}

export type ReadinessLevel = 'ready' | 'near' | 'not_ready';

export interface LeaderRoleInput {
  unitType: UnitType;
  roleType: RoleType;
  primaryCommanderId: string | null;
  primaryCommanderName: string | null;
  secondaryCommanderId: string | null;
  secondaryCommanderName: string | null;
  primaryGearFile: File | null;
  primaryArmamentsFile: File | null;
  primarySkillsFile: File | null;
  secondaryGearFile: File | null;
  secondaryArmamentsFile: File | null;
  secondarySkillsFile: File | null;
}

export interface LeaderApplicationInput {
  kingdom: string;
  name: string;
  govId: string;
  discord?: string;
  notes?: string;
  locale?: string;
  roles: LeaderRoleInput[];
}

const BUCKET = 'leader-applications';
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_BACKOFF_MS = 800;

/** Distinguish a network-layer failure (TypeError: Failed to fetch — client
 *  couldn't even reach the endpoint) from a Supabase-side rejection (auth,
 *  RLS, quota). The wording of the surfaced error changes accordingly, so
 *  applicants troubleshoot the actual problem instead of chasing the bucket
 *  when their real issue is an ad-blocker or a captive-portal WiFi. */
function isFetchFailure(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|network|networkerror|load failed/i.test(msg);
}

async function uploadCommanderScreenshot(
  file: File,
  applicationId: string,
  slot: string,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const safeSlot = slot.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${applicationId}/${safeSlot}_${Date.now()}.${ext}`;

  // Retry loop — 3 attempts with linear backoff. Transient network hiccups
  // (spotty WiFi, brief captive-portal blip) usually recover by attempt 2.
  // Permission errors won't be helped by retrying but the extra ~2s cost is
  // negligible on the sad path.
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const { error } = await supabase
        .storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (!error) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return data.publicUrl;
      }
      lastError = error;
      // Non-network errors (RLS, quota, auth) won't be fixed by retrying.
      if (!isFetchFailure(error)) break;
    } catch (thrown) {
      lastError = thrown;
      if (!isFetchFailure(thrown)) break;
    }
    if (attempt < UPLOAD_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, UPLOAD_BACKOFF_MS * attempt));
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  if (isFetchFailure(lastError)) {
    throw new Error(
      `Screenshot upload failed (${slot}): ${errMsg}. ` +
        `Your browser could not reach Supabase Storage after ${UPLOAD_MAX_ATTEMPTS} attempts. ` +
        `Common causes: ad-blocker / privacy extension blocking supabase.co, ` +
        `restrictive WiFi (corporate, hotel, school), or a VPN. ` +
        `Try disabling extensions, switching to mobile data, or another browser.`,
    );
  }
  throw new Error(
    `Screenshot upload failed (${slot}): ${errMsg}. ` +
      `Check that the "${BUCKET}" Supabase storage bucket exists, is public, and has an INSERT policy for anon.`,
  );
}

export async function submitLeaderApplication(
  input: LeaderApplicationInput,
): Promise<{ id: string } | { error: string }> {
  const { data: app, error: appErr } = await supabase
    .from('leader_applications')
    .insert([{
      kingdom: input.kingdom.trim(),
      name: input.name.trim(),
      gov_id: input.govId.trim(),
      discord: input.discord?.trim() || null,
      notes: input.notes?.trim() || null,
      locale: input.locale || null,
    }])
    .select('id')
    .single();

  if (appErr || !app) {
    return { error: appErr?.message || 'Failed to create application' };
  }

  // Sequential uploads (one file at a time) — 6-way parallelism was saturating
  // mobile/slow uplinks and causing every leg to time out at once. Slower to
  // finish on a good line, but way more reliable on the marginal ones we can't
  // control (school WiFi, spotty mobile data). Roles are still processed in
  // order, and within a role the six shots go one after the other.
  const roleRows: Array<Record<string, unknown>> = [];
  try {
    for (let idx = 0; idx < input.roles.length; idx++) {
      const role = input.roles[idx];
      const uploadIfPresent = (file: File | null, slot: string): Promise<string | null> =>
        file ? uploadCommanderScreenshot(file, app.id, slot) : Promise.resolve(null);
      const primaryGear = await uploadIfPresent(role.primaryGearFile, `role${idx}_primary_gear`);
      const primaryArmaments = await uploadIfPresent(role.primaryArmamentsFile, `role${idx}_primary_armaments`);
      const primarySkills = await uploadIfPresent(role.primarySkillsFile, `role${idx}_primary_skills`);
      const secondaryGear = await uploadIfPresent(role.secondaryGearFile, `role${idx}_secondary_gear`);
      const secondaryArmaments = await uploadIfPresent(role.secondaryArmamentsFile, `role${idx}_secondary_armaments`);
      const secondarySkills = await uploadIfPresent(role.secondarySkillsFile, `role${idx}_secondary_skills`);
      roleRows.push({
        application_id: app.id,
        position: idx,
        unit_type: role.unitType,
        role_type: role.roleType,
        primary_commander_id: role.primaryCommanderId,
        primary_commander_name: role.primaryCommanderName,
        secondary_commander_id: role.secondaryCommanderId,
        secondary_commander_name: role.secondaryCommanderName,
        primary_gear_url: primaryGear,
        primary_armaments_url: primaryArmaments,
        primary_skills_url: primarySkills,
        secondary_gear_url: secondaryGear,
        secondary_armaments_url: secondaryArmaments,
        secondary_skills_url: secondarySkills,
      });
    }
  } catch (err) {
    // Roll back the application row so the user can retry cleanly.
    await supabase.from('leader_applications').delete().eq('id', app.id);
    return { error: err instanceof Error ? err.message : 'Screenshot upload failed' };
  }

  const { error: rolesErr } = await supabase
    .from('leader_application_roles')
    .insert(roleRows);

  if (rolesErr) {
    await supabase.from('leader_applications').delete().eq('id', app.id);
    return { error: rolesErr.message };
  }

  return { id: app.id };
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
): Promise<boolean> {
  const { error } = await supabase
    .from('leader_applications')
    .update({ status })
    .eq('id', id);
  if (error) {
    console.error('Failed to update application status:', error.message);
    return false;
  }
  return true;
}

export async function updateApplicationRating(
  id: string,
  rating: number | null,
): Promise<boolean> {
  const { error } = await supabase
    .from('leader_applications')
    .update({ rating })
    .eq('id', id);
  if (error) {
    console.error('Failed to update application rating:', error.message);
    return false;
  }
  return true;
}

export async function updateApplicationReadiness(
  id: string,
  readiness: ReadinessLevel | null,
  note?: string | null,
): Promise<boolean> {
  const patch: { readiness: ReadinessLevel | null; readiness_note?: string | null } = { readiness };
  if (note !== undefined) patch.readiness_note = note;
  const { error } = await supabase.from('leader_applications').update(patch).eq('id', id);
  if (error) {
    console.error('Failed to update application readiness:', error.message);
    return false;
  }
  return true;
}

export async function deleteApplication(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('leader_applications')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Failed to delete application:', error.message);
    return false;
  }
  return true;
}

export function useLeaderApplications() {
  const [apps, setApps] = useState<LeaderApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leader_applications')
      .select('*, leader_application_roles(*)')
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      setApps([]);
    } else {
      setError(null);
      const rows = (data || []) as LeaderApplicationRow[];
      rows.forEach((r) => r.leader_application_roles?.sort((a, b) => a.position - b.position));
      setApps(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { apps, loading, error, reload };
}
