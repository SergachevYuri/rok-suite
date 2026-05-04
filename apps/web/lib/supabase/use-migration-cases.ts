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
  // Repeat-zero tracking. "Zeroed once" increments the counter without
  // closing the case (vs. "Confirm Zeroed" which moves to terminal state).
  zeroed_count: number;
  last_zeroed_at: string | null;
  last_zeroed_by: string | null;
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

/** Refresh `migration_cases.username` from the freshest scan we have, so
 *  in-game name changes (same gov_id, new name) propagate to the Zero List
 *  without requiring an explicit "refresh from scan" click.
 *
 *  Looks at both seeds_kd_players (auto-scrape, most current) and
 *  kingdom_scan_players (manual XLSX) and prefers the one with the latest
 *  timestamp per gov_id. Cases not present in either are left unchanged. */
export async function syncZeroListNamesFromLatestScans(): Promise<{ checked: number; renamed: number }> {
  const sb = createClient();
  const KINGDOM_ID = 3923;

  // 1) Pull all migration_cases (zero_list + cycle — both surface in the Zero List view).
  const { data: cases, error: e1 } = await sb
    .from('migration_cases')
    .select('id, character_id, username');
  if (e1) throw e1;
  if (!cases || cases.length === 0) return { checked: 0, renamed: 0 };

  // 2) Build a name lookup from the freshest seeds scan for K23.
  type NameEntry = { name: string; ts: string };
  const latest = new Map<number, NameEntry>();

  try {
    const { data: latestDateRow } = await sb
      .from('seeds_kd_players')
      .select('scan_date')
      .eq('kingdom_id', KINGDOM_ID)
      .order('scan_date', { ascending: false })
      .limit(1);
    const date = latestDateRow?.[0]?.scan_date as string | undefined;
    if (date) {
      let from = 0;
      while (true) {
        const { data, error } = await sb
          .from('seeds_kd_players')
          .select('player_id, name')
          .eq('kingdom_id', KINGDOM_ID)
          .eq('scan_date', date)
          .range(from, from + 999);
        if (error || !data || data.length === 0) break;
        for (const r of data) {
          const n = ((r.name as string) ?? '').trim();
          if (n) latest.set(r.player_id as number, { name: n, ts: `${date}T23:59:59Z` });
        }
        if (data.length < 1000) break;
        from += 1000;
      }
    }
  } catch (e) {
    console.warn('Name sync: seeds lookup failed', e);
  }

  // 3) Layer on the latest manual XLSX scan — wins per gov_id only if newer.
  try {
    const { data: ks } = await sb
      .from('kingdom_scans')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    const top = ks?.[0];
    if (top) {
      let from = 0;
      while (true) {
        const { data, error } = await sb
          .from('kingdom_scan_players')
          .select('governor_id, name')
          .eq('scan_id', top.id as number)
          .range(from, from + 999);
        if (error || !data || data.length === 0) break;
        for (const r of data) {
          const n = ((r.name as string) ?? '').trim();
          if (!n) continue;
          const gov = r.governor_id as number;
          const existing = latest.get(gov);
          if (!existing || top.created_at > existing.ts) {
            latest.set(gov, { name: n, ts: top.created_at as string });
          }
        }
        if (data.length < 1000) break;
        from += 1000;
      }
    }
  } catch (e) {
    console.warn('Name sync: kingdom_scans lookup failed', e);
  }

  if (latest.size === 0) return { checked: cases.length, renamed: 0 };

  // 4) For each case, if the latest name differs, update.
  let renamed = 0;
  for (const c of cases) {
    const charId = c.character_id as number;
    const fresh = latest.get(charId);
    if (!fresh) continue;
    const current = ((c.username as string) ?? '').trim();
    if (fresh.name === current) continue;
    const { error } = await sb
      .from('migration_cases')
      .update({ username: fresh.name, updated_at: new Date().toISOString() })
      .eq('id', c.id as string);
    if (!error) renamed += 1;
  }

  return { checked: cases.length, renamed };
}

/** Record that a player was zeroed once *without* closing the case — they
 *  stay on the active Zero List so the queue keeps showing them next time
 *  they re-build. Increments zeroed_count and refreshes last_zeroed_*. */
export async function markZeroedOnce(id: string, officerName: string): Promise<void> {
  const sb = createClient();
  // Read current count, increment, write back. Two officers clicking at the
  // same instant could race; the count is approximate by design and the worst
  // case is one missed increment, which is fine for what this tracks.
  const { data: row, error: e1 } = await sb
    .from('migration_cases')
    .select('zeroed_count')
    .eq('id', id)
    .single();
  if (e1) throw e1;
  const next = ((row?.zeroed_count as number | null) ?? 0) + 1;
  const { error: e2 } = await sb
    .from('migration_cases')
    .update({
      zeroed_count: next,
      last_zeroed_at: new Date().toISOString(),
      last_zeroed_by: officerName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (e2) throw e2;
}

export async function markAfk(id: string, officerName: string) {
  return patchCase(id, {
    state: 'afk',
    afk_at: new Date().toISOString(),
    afk_by: officerName,
  });
}

/** Roll back the most recent state change one step. Looks at which earlier
 *  per-state timestamps are still set on the row and returns the case to the
 *  most-advanced earlier state, clearing the current state's timestamps. Use
 *  when an officer/admin misclicks a state action. Returns null if there's
 *  nothing to undo (already pending). */
export async function undoLastStateChange(id: string): Promise<MigrationState | null> {
  const { data, error } = await createClient()
    .from('migration_cases')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  const c = data as MigrationCase;
  if (c.state === 'pending') return null;

  // Most-advanced earlier state along the main pending → claimed → contacted →
  // marked_to_zero path, optionally excluding the state we're undoing.
  const priorMain = (excluding: MigrationState | null = null): MigrationState => {
    if (excluding !== 'marked_to_zero' && c.marked_to_zero_at) return 'marked_to_zero';
    if (excluding !== 'contacted' && c.contacted_at) return 'contacted';
    if (excluding !== 'claimed' && c.claimed_at) return 'claimed';
    return 'pending';
  };

  const patch: Partial<MigrationCase> = {};
  switch (c.state) {
    case 'zeroed':
      patch.state = priorMain();
      patch.zeroed_at = null;
      patch.zeroed_by = null;
      break;
    case 'migrated':
      patch.state = priorMain();
      patch.migrated_confirmed_at = null;
      patch.migrated_confirmed_by = null;
      break;
    case 'excepted':
      patch.state = priorMain();
      patch.excepted_at = null;
      patch.excepted_by = null;
      patch.exception_reason = null;
      break;
    case 'afk':
      patch.state = priorMain();
      patch.afk_at = null;
      patch.afk_by = null;
      break;
    case 'marked_to_zero':
      patch.state = priorMain('marked_to_zero');
      patch.marked_to_zero_at = null;
      patch.marked_to_zero_by = null;
      break;
    case 'contacted':
      patch.state = priorMain('contacted');
      patch.contacted_at = null;
      break;
    case 'claimed':
      patch.state = 'pending';
      patch.claimed_at = null;
      patch.claimed_by = null;
      break;
  }
  await patchCase(id, patch);
  return patch.state ?? null;
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

/** Refresh coords + last-seen power/alliance/name for a set of zero-list cases from a fresh scan.
 *  Match is by character_id; cases not present in the scan are left alone.
 *  Username is rewritten when the scan reports a different name for the same gov_id —
 *  players sometimes rename in-game and the Zero List should follow. */
export async function refreshZeroListFromScan(
  /** Pass null for ad-hoc CSV uploads that aren't backed by a kingdom_scans row. */
  scanId: number | null,
  scanRows: { governorId: number; name: string; x: number | null; y: number | null; power: number; alliance: string | null }[],
): Promise<{ updated: number; renamed: number }> {
  if (scanRows.length === 0) return { updated: 0, renamed: 0 };
  const sb = createClient();
  // Pull current zero-list rows — we only update existing rows, never insert.
  const { data: zlist, error: e1 } = await sb
    .from('migration_cases')
    .select('id, character_id, username')
    .eq('source_kind', 'zero_list');
  if (e1) throw e1;
  const rowByChar = new Map<number, { id: string; username: string }>();
  for (const r of zlist ?? []) rowByChar.set(r.character_id as number, { id: r.id as string, username: (r.username as string) ?? '' });
  const byChar = new Map<number, typeof scanRows[number]>();
  for (const r of scanRows) byChar.set(r.governorId, r);
  let updated = 0;
  let renamed = 0;
  for (const [charId, row] of byChar) {
    const existing = rowByChar.get(charId);
    if (!existing) continue;
    const newName = (row.name ?? '').trim();
    const willRename = newName.length > 0 && newName !== existing.username;
    const patch: Record<string, unknown> = {
      x: row.x,
      y: row.y,
      last_seen_power: row.power,
      last_seen_alliance: row.alliance,
      last_seen_scan_id: scanId,
      updated_at: new Date().toISOString(),
    };
    if (willRename) patch.username = newName;
    const { error } = await sb
      .from('migration_cases')
      .update(patch)
      .eq('id', existing.id);
    if (error) throw error;
    updated += 1;
    if (willRename) renamed += 1;
  }
  return { updated, renamed };
}
