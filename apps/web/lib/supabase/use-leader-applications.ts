import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';

export type UnitType = 'infantry' | 'archer' | 'cavalry';
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
  secondary_gear_url: string | null;
  secondary_armaments_url: string | null;
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
  leader_application_roles: LeaderApplicationRoleRow[];
}

export interface LeaderRoleInput {
  unitType: UnitType;
  roleType: RoleType;
  primaryCommanderId: string | null;
  primaryCommanderName: string | null;
  secondaryCommanderId: string | null;
  secondaryCommanderName: string | null;
  primaryGearFile: File | null;
  primaryArmamentsFile: File | null;
  secondaryGearFile: File | null;
  secondaryArmamentsFile: File | null;
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

async function uploadCommanderScreenshot(
  file: File,
  applicationId: string,
  slot: string,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const safeSlot = slot.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${applicationId}/${safeSlot}_${Date.now()}.${ext}`;

  const { error } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    throw new Error(
      `Screenshot upload failed (${slot}): ${error.message}. ` +
        `Check that the "${BUCKET}" Supabase storage bucket exists, is public, and has an INSERT policy for anon.`,
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
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

  let roleRows;
  try {
    roleRows = await Promise.all(
      input.roles.map(async (role, idx) => {
        const [primaryGear, primaryArmaments, secondaryGear, secondaryArmaments] = await Promise.all([
          role.primaryGearFile
            ? uploadCommanderScreenshot(role.primaryGearFile, app.id, `role${idx}_primary_gear`)
            : Promise.resolve(null),
          role.primaryArmamentsFile
            ? uploadCommanderScreenshot(role.primaryArmamentsFile, app.id, `role${idx}_primary_armaments`)
            : Promise.resolve(null),
          role.secondaryGearFile
            ? uploadCommanderScreenshot(role.secondaryGearFile, app.id, `role${idx}_secondary_gear`)
            : Promise.resolve(null),
          role.secondaryArmamentsFile
            ? uploadCommanderScreenshot(role.secondaryArmamentsFile, app.id, `role${idx}_secondary_armaments`)
            : Promise.resolve(null),
        ]);
        return {
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
          secondary_gear_url: secondaryGear,
          secondary_armaments_url: secondaryArmaments,
        };
      }),
    );
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
