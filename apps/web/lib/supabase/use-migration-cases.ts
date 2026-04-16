import { createClient } from './client';

export type MigrationState =
  | 'pending'
  | 'claimed'
  | 'contacted'
  | 'excepted'
  | 'migrated'
  | 'marked_to_zero'
  | 'zeroed';

/** States that end the lifecycle (no further action expected). marked_to_zero is NOT terminal — zeroing still needs confirmation. */
export const TERMINAL_STATES: MigrationState[] = ['migrated', 'excepted', 'zeroed'];

export interface MigrationCycle {
  id: string;
  created_at: string;
  created_by: string | null;
  name: string;
  deadline: string;
  closed_at: string | null;
  notes: string | null;
}

export interface MigrationCase {
  id: string;
  cycle_id: string;
  character_id: number;
  username: string;
  power_at_open: number;
  state: MigrationState;
  claimed_by: string | null;
  claimed_at: string | null;
  contacted_at: string | null;
  migration_suggested_at: string | null;
  migrated_confirmed_at: string | null;
  migrated_confirmed_by: string | null;
  excepted_at: string | null;
  excepted_by: string | null;
  exception_reason: string | null;
  marked_to_zero_at: string | null;
  marked_to_zero_by: string | null;
  zeroed_at: string | null;
  zeroed_by: string | null;
  notes: string | null;
  updated_at: string;
}

// ——— Cycles ———

export async function listCycles(): Promise<MigrationCycle[]> {
  const { data, error } = await createClient()
    .from('migration_cycles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MigrationCycle[];
}

export async function createCycle(input: {
  name: string;
  deadline: string; // ISO
  createdBy: string;
  notes?: string | null;
}): Promise<MigrationCycle> {
  const { data, error } = await createClient()
    .from('migration_cycles')
    .insert({
      name: input.name,
      deadline: input.deadline,
      created_by: input.createdBy,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MigrationCycle;
}

export async function updateCycle(id: string, patch: Partial<Pick<MigrationCycle, 'name' | 'deadline' | 'closed_at' | 'notes'>>) {
  const { error } = await createClient().from('migration_cycles').update(patch).eq('id', id);
  if (error) throw error;
}

export async function closeCycle(id: string) {
  return updateCycle(id, { closed_at: new Date().toISOString() });
}

export async function deleteCycle(id: string) {
  const { error } = await createClient().from('migration_cycles').delete().eq('id', id);
  if (error) throw error;
}

// ——— Cases ———

export async function listCases(cycleId: string): Promise<MigrationCase[]> {
  const { data, error } = await createClient()
    .from('migration_cases')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('power_at_open', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MigrationCase[];
}

/** Bulk-create cases from a snapshot of players (e.g. the currently flagged list on the DKP page). */
export async function bulkCreateCases(
  cycleId: string,
  entries: { characterId: number; username: string; power: number }[],
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({
    cycle_id: cycleId,
    character_id: e.characterId,
    username: e.username,
    power_at_open: e.power,
  }));
  // upsert on (cycle_id, character_id) so re-running against an existing cycle is safe.
  const { error } = await createClient()
    .from('migration_cases')
    .upsert(rows, { onConflict: 'cycle_id,character_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function addCase(cycleId: string, entry: { characterId: number; username: string; power: number }) {
  const { error } = await createClient().from('migration_cases').insert({
    cycle_id: cycleId,
    character_id: entry.characterId,
    username: entry.username,
    power_at_open: entry.power,
  });
  if (error) throw error;
}

export async function deleteCase(id: string) {
  const { error } = await createClient().from('migration_cases').delete().eq('id', id);
  if (error) throw error;
}

async function patchCase(id: string, patch: Partial<MigrationCase>) {
  const { error } = await createClient()
    .from('migration_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ——— State transitions ———

export async function claimCase(id: string, officerName: string) {
  return patchCase(id, {
    state: 'claimed',
    claimed_by: officerName,
    claimed_at: new Date().toISOString(),
  });
}

export async function unclaimCase(id: string) {
  return patchCase(id, {
    state: 'pending',
    claimed_by: null,
    claimed_at: null,
  });
}

export async function markContacted(id: string) {
  return patchCase(id, {
    state: 'contacted',
    contacted_at: new Date().toISOString(),
  });
}

export async function markToZero(id: string, officerName: string) {
  return patchCase(id, {
    state: 'marked_to_zero',
    marked_to_zero_at: new Date().toISOString(),
    marked_to_zero_by: officerName,
  });
}

export async function suggestMigrated(id: string) {
  return patchCase(id, {
    migration_suggested_at: new Date().toISOString(),
  });
}

export async function confirmMigrated(id: string, officerName: string) {
  return patchCase(id, {
    state: 'migrated',
    migrated_confirmed_at: new Date().toISOString(),
    migrated_confirmed_by: officerName,
  });
}

export async function markException(id: string, adminName: string, reason: string) {
  return patchCase(id, {
    state: 'excepted',
    excepted_at: new Date().toISOString(),
    excepted_by: adminName,
    exception_reason: reason,
  });
}

export async function confirmZeroed(id: string, officerName: string) {
  return patchCase(id, {
    state: 'zeroed',
    zeroed_at: new Date().toISOString(),
    zeroed_by: officerName,
  });
}

/** Reset a case back to pending (undo). Clears per-state timestamps but keeps suggestion markers + notes. */
export async function resetCaseToPending(id: string) {
  return patchCase(id, {
    state: 'pending',
    claimed_by: null,
    claimed_at: null,
    contacted_at: null,
    migrated_confirmed_at: null,
    migrated_confirmed_by: null,
    excepted_at: null,
    excepted_by: null,
    exception_reason: null,
    marked_to_zero_at: null,
    marked_to_zero_by: null,
    zeroed_at: null,
    zeroed_by: null,
  });
}

export async function updateCaseNotes(id: string, notes: string | null) {
  return patchCase(id, { notes });
}

// ——— Realtime ———

export function subscribeToCycles(onChange: () => void): () => void {
  const channel = createClient()
    .channel('migration_cycles_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'migration_cycles' }, onChange)
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}

export function subscribeToCases(cycleId: string, onChange: () => void): () => void {
  const channel = createClient()
    .channel(`migration_cases_${cycleId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'migration_cases', filter: `cycle_id=eq.${cycleId}` },
      onChange,
    )
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}
