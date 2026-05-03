import { createClient } from './client';

export type MigrationState =
  | 'pending'
  | 'claimed'
  | 'contacted'
  | 'excepted'
  | 'migrated'
  | 'marked_to_zero'
  | 'zeroed'
  | 'afk';

/** States that end the lifecycle (no further action expected). marked_to_zero is NOT terminal — zeroing still needs confirmation. */
export const TERMINAL_STATES: MigrationState[] = ['migrated', 'excepted', 'zeroed', 'afk'];

export interface MigrationCycle {
  id: string;
  created_at: string;
  created_by: string | null;
  name: string;
  deadline: string;
  closed_at: string | null;
  notes: string | null;
}

/** Where a case originated — drives which UI surface it appears on. */
export type CaseSourceKind = 'cycle' | 'zero_list';

export interface MigrationCase {
  id: string;
  /** Null for source_kind='zero_list'. */
  cycle_id: string | null;
  source_kind: CaseSourceKind;
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
  exception_requested_at: string | null;
  exception_requested_by: string | null;
  exception_request_reason: string | null;
  exception_suggestion: 'approve' | 'deny' | null;
  marked_to_zero_at: string | null;
  marked_to_zero_by: string | null;
  zeroed_at: string | null;
  zeroed_by: string | null;
  afk_at: string | null;
  afk_by: string | null;
  notes: string | null;
  updated_at: string;
  // Zero-list-specific fields (nullable for cycle cases)
  x: number | null;
  y: number | null;
  last_seen_scan_id: number | null;
  last_seen_power: number | null;
  last_seen_alliance: string | null;
  added_by: string | null;
  added_reason: string | null;
  // Delay window — when set and in the future, the case is hidden from the
  // power-tier Zero List view (officer/admin still see it with a badge).
  delayed_until: string | null;
  delayed_by: string | null;
  delayed_reason: string | null;
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
    .eq('source_kind', 'cycle')
    .order('power_at_open', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MigrationCase[];
}

/** All cases that should appear on the Zero List view: native zero_list cases
 *  PLUS cycle cases that have been marked to zero (so once an officer flips a
 *  cycle case to "To Zero", power members see it on the kill queue without any
 *  manual sync). Both source kinds use the same state machine, so the Zero List
 *  UI can act on either uniformly. */
export async function listZeroListCases(): Promise<MigrationCase[]> {
  const sb = createClient();
  const [own, fromCycle] = await Promise.all([
    sb
      .from('migration_cases')
      .select('*')
      .eq('source_kind', 'zero_list')
      .order('power_at_open', { ascending: false }),
    sb
      .from('migration_cases')
      .select('*')
      .eq('source_kind', 'cycle')
      .in('state', ['marked_to_zero'])
      .order('power_at_open', { ascending: false }),
  ]);
  if (own.error) throw own.error;
  if (fromCycle.error) throw fromCycle.error;
  // Merge, dedupe by character_id (cycle wins if both — gives the user the cycle context)
  const seen = new Set<number>();
  const merged: MigrationCase[] = [];
  for (const row of [...(fromCycle.data ?? []), ...(own.data ?? [])] as MigrationCase[]) {
    if (seen.has(row.character_id)) continue;
    seen.add(row.character_id);
    merged.push(row);
  }
  merged.sort((a, b) => (b.last_seen_power ?? b.power_at_open) - (a.last_seen_power ?? a.power_at_open));
  return merged;
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

export async function dismissMigrationSuggestion(id: string) {
  return patchCase(id, {
    migration_suggested_at: null,
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
    // Clear any pending request so it no longer shows in the review queue.
    exception_requested_at: null,
    exception_requested_by: null,
    exception_request_reason: null,
    exception_suggestion: null,
  });
}

/** Officer flags a case for admin review, with a reason and suggested outcome. */
export async function requestException(
  id: string,
  officerName: string,
  reason: string,
  suggestion: 'approve' | 'deny',
) {
  return patchCase(id, {
    exception_requested_at: new Date().toISOString(),
    exception_requested_by: officerName,
    exception_request_reason: reason,
    exception_suggestion: suggestion,
  });
}

/** Admin denies a pending exception request — clears the request, state stays. */
export async function denyExceptionRequest(id: string) {
  return patchCase(id, {
    exception_requested_at: null,
    exception_requested_by: null,
    exception_request_reason: null,
    exception_suggestion: null,
  });
}

/** Hold the case off the power-tier Zero List view for a window. Officers and
 *  admins still see it (with a "delayed until X" badge). Used to give a player
 *  a chance to leave voluntarily before power members start attacking. */
export async function delayCase(
  id: string,
  hours: number,
  by: string,
  reason: string | null = null,
) {
  const ts = new Date(Date.now() + Math.max(0, hours) * 3_600_000).toISOString();
  return patchCase(id, {
    delayed_until: ts,
    delayed_by: by,
    delayed_reason: reason,
  });
}

export async function undelayCase(id: string) {
  return patchCase(id, {
    delayed_until: null,
    delayed_by: null,
    delayed_reason: null,
  });
}

/** Edit only the exception reason — leaves state, excepted_at, etc. untouched. */
export async function updateExceptionReason(id: string, reason: string | null) {
  return patchCase(id, { exception_reason: reason });
}

/** Edit only the delay reason — leaves the delay window itself untouched. */
export async function updateDelayReason(id: string, reason: string | null) {
  return patchCase(id, { delayed_reason: reason });
}

/** Manually set / clear the stored coords on a Zero List row. Pass nulls to
 *  clear and fall back to whatever the latest location scan provides. */
export async function updateCaseCoords(id: string, x: number | null, y: number | null) {
  return patchCase(id, { x, y });
}

export async function confirmZeroed(id: string, officerName: string) {
  return patchCase(id, {
    state: 'zeroed',
    zeroed_at: new Date().toISOString(),
    zeroed_by: officerName,
  });
}

export async function markAfk(id: string, officerName: string) {
  return patchCase(id, {
    state: 'afk',
    afk_at: new Date().toISOString(),
    afk_by: officerName,
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
    exception_requested_at: null,
    exception_requested_by: null,
    exception_request_reason: null,
    exception_suggestion: null,
    marked_to_zero_at: null,
    marked_to_zero_by: null,
    zeroed_at: null,
    zeroed_by: null,
    afk_at: null,
    afk_by: null,
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

/** Zero list realtime — no cycle filter, server-side filter by source_kind isn't supported in
 *  Supabase realtime so we just receive all changes and let the caller refresh. */
export function subscribeToZeroList(onChange: () => void): () => void {
  const channel = createClient()
    .channel('migration_cases_zero_list')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'migration_cases' },
      onChange,
    )
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}

// ——— Zero List specific actions ———

/** Bulk-add players to the zero list (kingdom-scoped, no cycle). Idempotent — duplicate
 *  character_ids are silently ignored thanks to the unique partial index. */
export async function bulkAddToZeroList(
  entries: { characterId: number; username: string; power: number; x?: number | null; y?: number | null; alliance?: string | null; lastSeenScanId?: number | null; addedBy?: string | null; reason?: string | null }[],
): Promise<{ added: number; skipped: number }> {
  if (entries.length === 0) return { added: 0, skipped: 0 };
  const sb = createClient();
  // Look up which character_ids already have a zero_list row, so we only insert
  // genuine new entries. PostgREST upsert with our partial-unique index
  // (UNIQUE (character_id) WHERE source_kind='zero_list') doesn't accept the
  // index predicate as an onConflict target, which is why a plain upsert was
  // failing with a generic Supabase error.
  const ids = entries.map((e) => e.characterId);
  const { data: existing, error: e1 } = await sb
    .from('migration_cases')
    .select('character_id')
    .eq('source_kind', 'zero_list')
    .in('character_id', ids);
  if (e1) throw new Error(`Lookup failed: ${e1.message}`);
  const existingIds = new Set((existing ?? []).map((r) => r.character_id as number));
  const fresh = entries.filter((e) => !existingIds.has(e.characterId));
  if (fresh.length === 0) return { added: 0, skipped: entries.length };
  const rows = fresh.map((e) => ({
    cycle_id: null,
    source_kind: 'zero_list' as const,
    character_id: e.characterId,
    username: e.username,
    power_at_open: e.power,
    last_seen_power: e.power,
    x: e.x ?? null,
    y: e.y ?? null,
    last_seen_alliance: e.alliance ?? null,
    last_seen_scan_id: e.lastSeenScanId ?? null,
    added_by: e.addedBy ?? null,
    added_reason: e.reason ?? null,
  }));
  const { error: e2 } = await sb.from('migration_cases').insert(rows);
  if (e2) {
    // Surface the actual Postgres error message (was previously stringifying
    // the whole object → "[object Object]" in the alert).
    const detail = [e2.message, e2.details, e2.hint].filter(Boolean).join(' · ');
    throw new Error(detail || 'unknown insert error');
  }
  return { added: fresh.length, skipped: entries.length - fresh.length };
}

export async function removeFromZeroList(id: string): Promise<void> {
  const { error } = await createClient().from('migration_cases').delete().eq('id', id).eq('source_kind', 'zero_list');
  if (error) throw error;
}

/** Refresh coords + last-seen power/alliance for a set of zero-list cases from a fresh scan.
 *  Match is by character_id; cases not present in the scan are left alone. */
export async function refreshZeroListFromScan(
  /** Pass null for ad-hoc CSV uploads that aren't backed by a kingdom_scans row. */
  scanId: number | null,
  scanRows: { governorId: number; x: number | null; y: number | null; power: number; alliance: string | null }[],
): Promise<{ updated: number }> {
  if (scanRows.length === 0) return { updated: 0 };
  const sb = createClient();
  // Pull current zero-list character_ids — we only update existing rows, never insert.
  const { data: zlist, error: e1 } = await sb
    .from('migration_cases')
    .select('id, character_id')
    .eq('source_kind', 'zero_list');
  if (e1) throw e1;
  const idByChar = new Map<number, string>();
  for (const r of zlist ?? []) idByChar.set(r.character_id as number, r.id as string);
  const byChar = new Map<number, typeof scanRows[number]>();
  for (const r of scanRows) byChar.set(r.governorId, r);
  let updated = 0;
  for (const [charId, row] of byChar) {
    const id = idByChar.get(charId);
    if (!id) continue;
    const { error } = await sb
      .from('migration_cases')
      .update({
        x: row.x,
        y: row.y,
        last_seen_power: row.power,
        last_seen_alliance: row.alliance,
        last_seen_scan_id: scanId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    updated += 1;
  }
  return { updated };
}
