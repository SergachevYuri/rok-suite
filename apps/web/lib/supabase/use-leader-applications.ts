import { supabase } from '../supabase';

export type UnitType = 'infantry' | 'archer' | 'cavalry';
export type RoleType = 'rally' | 'garrison';

export interface LeaderRoleInput {
  unitType: UnitType;
  roleType: RoleType;
  primaryFile: File | null;
  secondaryFile: File | null;
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
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'png';
  const safeSlot = slot.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${applicationId}/${safeSlot}_${Date.now()}.${ext}`;

  const { error } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error('Failed to upload commander screenshot:', error.message);
    return null;
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

  const roleRows = await Promise.all(
    input.roles.map(async (role, idx) => {
      const [primaryUrl, secondaryUrl] = await Promise.all([
        role.primaryFile
          ? uploadCommanderScreenshot(role.primaryFile, app.id, `role${idx}_primary`)
          : Promise.resolve(null),
        role.secondaryFile
          ? uploadCommanderScreenshot(role.secondaryFile, app.id, `role${idx}_secondary`)
          : Promise.resolve(null),
      ]);
      return {
        application_id: app.id,
        position: idx,
        unit_type: role.unitType,
        role_type: role.roleType,
        primary_screenshot_url: primaryUrl,
        secondary_screenshot_url: secondaryUrl,
      };
    }),
  );

  const { error: rolesErr } = await supabase
    .from('leader_application_roles')
    .insert(roleRows);

  if (rolesErr) {
    return { error: rolesErr.message };
  }

  return { id: app.id };
}
