import { parseKingdomXLSX } from '@/lib/kingdom/parse';
import type { KingdomExportRow } from '@/lib/kingdom/types';
import { createClient } from '@/lib/supabase/client';

export interface Player {
  characterId: number;
  username: string;
  power: number;
  highestPower: number;
  t5Deaths: number;
  t4Deaths: number;
  totalKP: number;
  t5Kills: number;
  t4Kills: number;
  rssGathered: number;
  allianceHelps: number;
  dkp: number;
  honorPoints: number;
}

export interface HonorRow {
  name: string;
  honorPoints: number;
}

export interface DkpDataset {
  id?: string;
  uploadedAt: string;
  uploadedBy: string | null;
  statsFileName: string | null;
  honorFileName: string | null;
  /** Owning KvK. Optional for legacy rows uploaded before the per-KvK rework. */
  kvkId?: string | null;
  /** ROK kingdom id (e.g. 3923). Optional for the same reason. */
  kingdomId?: number | null;
  players: Player[];
}

/** Normalize a player name for matching: strip ANG prefixes, lowercase, remove diacritics. */
export function normalizeName(name: string): string {
  return name
    .replace(/^\['ANG\]\s*/i, '')
    .replace(/^\[ANG\]\s*/i, '')
    .replace(/^ang\s*/i, '')
    .replace(/^ᵃⁿᵍ\s*/i, '')
    .replace(/^ᴬ\s*/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Loose token-based search: every token in query must appear in normalized name. */
export function looseMatch(name: string, query: string): boolean {
  const n = normalizeName(name);
  const tokens = normalizeName(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => n.includes(t));
}

/** Parse the Honor Rankings XLSX file. Expected columns: Rank, Name, Kingdom, Honor Points. */
export async function parseHonorXLSX(arrayBuffer: ArrayBuffer): Promise<HonorRow[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, string | number>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const findKey = (row: Record<string, string | number>, ...candidates: string[]): string | null => {
    const keys = Object.keys(row);
    for (const c of candidates) {
      const k = keys.find((kk) => kk.toLowerCase().replace(/\s+/g, '') === c.toLowerCase().replace(/\s+/g, ''));
      if (k) return k;
    }
    return null;
  };

  if (raw.length === 0) return [];
  const nameKey = findKey(raw[0], 'Name', 'Player', 'Player Name', 'player_name', 'Username');
  const honorKey = findKey(raw[0], 'Honor Points', 'HonorPoints', 'Honor', 'honor_points', 'Points');
  if (!nameKey || !honorKey) {
    throw new Error(
      `Honor file missing expected columns. Found: ${Object.keys(raw[0]).join(', ')}`,
    );
  }

  return raw
    .map((row) => ({
      name: String(row[nameKey] || '').trim(),
      honorPoints: typeof row[honorKey] === 'number' ? (row[honorKey] as number) : parseInt(String(row[honorKey])) || 0,
    }))
    .filter((r) => r.name);
}

/** Merge a kingdom stats export with honor rankings into the unified Player shape. */
export function mergeIntoPlayers(stats: KingdomExportRow[], honor: HonorRow[]): Player[] {
  const honorByName = new Map<string, number>();
  for (const h of honor) {
    honorByName.set(normalizeName(h.name), h.honorPoints);
  }
  return stats.map((s) => {
    const dkp =
      s.t4Kills * 5 + s.t5Kills * 10 + s.t4Deaths * 8 + s.t5Deaths * 24;
    return {
      characterId: s.governorId,
      username: s.name,
      power: s.power,
      highestPower: s.highestPower,
      t5Deaths: s.t5Deaths,
      t4Deaths: s.t4Deaths,
      totalKP: s.totalKillPoints,
      t5Kills: s.t5Kills,
      t4Kills: s.t4Kills,
      rssGathered: s.gathered,
      allianceHelps: s.allianceHelps,
      dkp,
      honorPoints: honorByName.get(normalizeName(s.name)) ?? 0,
    };
  });
}

export async function parseStatsFile(file: File): Promise<KingdomExportRow[]> {
  const buf = await file.arrayBuffer();
  return parseKingdomXLSX(buf);
}

export async function parseHonorFile(file: File): Promise<HonorRow[]> {
  const buf = await file.arrayBuffer();
  return parseHonorXLSX(buf);
}

/** Roster XLSX row. `id/kd/cityhall` are required (drive the DKP CH25 filter);
 *  `name/power/kp/rankInKd` are optional and populated when the roster carries
 *  them so we can also mirror the file into the Kingdom Stats scan tables. */
export interface RosterRow {
  playerId: number;
  kd: number;
  cityhall: number;
  name?: string;
  power?: number;
  kp?: number;
  rankInKd?: number;
}

/** Parse integers that may be formatted with EU thousands separators.
 *  "3.897" → 3897, "204.050.350" → 204050350, "25" → 25. */
function parseLooseInt(v: string | number | undefined | null): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.trunc(v);
  // Strip all dots, commas, spaces and non-breaking spaces used as separators.
  const cleaned = String(v).replace(/[.,\s ]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Parse a roster XLSX. Expected columns: KD, player_id, cityhall (others optional).
 *  Scans ALL sheets and uses the first that has the three required columns —
 *  handles files where the per-player roster is on a later tab (e.g. after a
 *  seeding-aggregate sheet). Column names are matched case-insensitively with
 *  spaces/underscores ignored. */
export async function parseRosterXLSX(arrayBuffer: ArrayBuffer): Promise<RosterRow[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const findKey = (row: Record<string, string | number>, ...candidates: string[]): string | null => {
    const keys = Object.keys(row);
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]/g, '');
    for (const c of candidates) {
      const target = norm(c);
      const k = keys.find((kk) => norm(kk) === target);
      if (k) return k;
    }
    return null;
  };

  // Track columns seen across sheets so the error message is actually useful.
  const sheetsInspected: { name: string; columns: string[] }[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const raw: Record<string, string | number>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (raw.length === 0) {
      sheetsInspected.push({ name: sheetName, columns: [] });
      continue;
    }
    const cols = Object.keys(raw[0]);
    sheetsInspected.push({ name: sheetName, columns: cols });

    const kdKey = findKey(raw[0], 'KD', 'kingdom', 'kingdom_id');
    const idKey = findKey(raw[0], 'player_id', 'playerid', 'governor_id', 'governorid', 'character_id', 'characterid', 'gov_id');
    const chKey = findKey(raw[0], 'cityhall', 'city_hall', 'ch');
    if (!kdKey || !idKey || !chKey) continue;

    // Optional columns — populated only when present. These let the caller
    // mirror the roster into the Kingdom Stats tables without a second upload.
    const nameKey = findKey(raw[0], 'name', 'username', 'player_name');
    const powerKey = findKey(raw[0], 'power');
    const kpKey = findKey(raw[0], 'KP', 'kill_points', 'total_kp');
    const rankKey = findKey(raw[0], 'Rank_in_KD', 'rank_in_kd', 'rank');

    return raw
      .map((row) => {
        const base: RosterRow = {
          playerId: parseLooseInt(row[idKey]),
          kd: parseLooseInt(row[kdKey]),
          cityhall: parseLooseInt(row[chKey]),
        };
        if (nameKey) {
          const raw = row[nameKey];
          const n = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
          if (n) base.name = n;
        }
        if (powerKey) base.power = parseLooseInt(row[powerKey]);
        if (kpKey) base.kp = parseLooseInt(row[kpKey]);
        if (rankKey) base.rankInKd = parseLooseInt(row[rankKey]);
        return base;
      })
      .filter((r) => r.playerId > 0);
  }

  const summary = sheetsInspected
    .map((s) => `"${s.name}": ${s.columns.length > 0 ? s.columns.join(', ') : '(empty)'}`)
    .join(' | ');
  throw new Error(
    `Roster file missing expected columns (KD, player_id, cityhall) in any sheet. Sheets scanned: ${summary}`,
  );
}

export async function parseRosterFile(file: File): Promise<RosterRow[]> {
  const buf = await file.arrayBuffer();
  return parseRosterXLSX(buf);
}

/** Mirror a parsed roster into the Kingdom Stats scan tables so the DKP upload
 *  can double-duty as a Kingdom Stats upload. Requires the roster to carry
 *  the optional name/power/kp/rankInKd columns — falls back gracefully when
 *  they're missing (0s). Idempotent: replaces any rows already sitting on
 *  (scan_date, kingdom_id, kvk_id) so re-runs don't duplicate. */
export async function pushRosterToKingdomStats(
  roster: RosterRow[],
  kvkId: string,
  scanDate: string,
): Promise<{ kingdoms: number; players: number }> {
  if (roster.length === 0 || !kvkId) return { kingdoms: 0, players: 0 };
  const sb = createClient();

  // Group by KD and skip rows without an id — same defensive behavior as SeedsUpload.
  const byKd = new Map<number, RosterRow[]>();
  for (const r of roster) {
    if (!r.kd || !r.playerId) continue;
    const bucket = byKd.get(r.kd) ?? [];
    bucket.push(r);
    byKd.set(r.kd, bucket);
  }
  if (byKd.size === 0) return { kingdoms: 0, players: 0 };

  // ─── Per-KD aggregate (top-400 power, total KP, top-300 slices, ranks) ─
  const summary: {
    kingdom_id: number;
    power_400: number;
    power_300: number;
    total_kp: number;
    kp_300: number;
  }[] = [];
  for (const [kingdom_id, rows] of byKd) {
    const byPower = [...rows].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    const power_400 = byPower.slice(0, 400).reduce((s, r) => s + (r.power ?? 0), 0);
    const power_300 = byPower.slice(0, 300).reduce((s, r) => s + (r.power ?? 0), 0);
    const total_kp = rows.reduce((s, r) => s + (r.kp ?? 0), 0);
    const byKp = [...rows].sort((a, b) => (b.kp ?? 0) - (a.kp ?? 0));
    const kp_300 = byKp.slice(0, 300).reduce((s, r) => s + (r.kp ?? 0), 0);
    summary.push({ kingdom_id, power_400, power_300, total_kp, kp_300 });
  }
  const byPowerDesc = [...summary].sort((a, b) => b.power_400 - a.power_400);
  const byKpDesc = [...summary].sort((a, b) => b.total_kp - a.total_kp);
  const powerRank = new Map<number, number>();
  const kpRank = new Map<number, number>();
  byPowerDesc.forEach((r, i) => powerRank.set(r.kingdom_id, i + 1));
  byKpDesc.forEach((r, i) => kpRank.set(r.kingdom_id, i + 1));

  const kdsInFile = [...byKd.keys()];

  // ─── Replace existing rows for these KDs on this scan_date + KvK ──────
  const { error: delPlayersErr } = await sb
    .from('seeds_kd_players')
    .delete()
    .eq('scan_date', scanDate)
    .in('kingdom_id', kdsInFile)
    .eq('kvk_id', kvkId);
  if (delPlayersErr) throw new Error(`Delete seeds players failed: ${delPlayersErr.message}`);

  const { error: delStatsErr } = await sb
    .from('seeds_kd_stats')
    .delete()
    .eq('scan_date', scanDate)
    .in('kingdom_id', kdsInFile)
    .eq('kvk_id', kvkId);
  if (delStatsErr) throw new Error(`Delete seeds stats failed: ${delStatsErr.message}`);

  // ─── Upsert stats + players ───────────────────────────────────────────
  const statsBatch = summary.map((r) => ({
    scan_date: scanDate,
    kvk_id: kvkId,
    kingdom_id: r.kingdom_id,
    power_400: r.power_400,
    power_300: r.power_300,
    total_kp: r.total_kp,
    kp_300: r.kp_300,
    power_rank: powerRank.get(r.kingdom_id) ?? 0,
    kp_rank: kpRank.get(r.kingdom_id) ?? 0,
  }));
  const { error: statsErr } = await sb
    .from('seeds_kd_stats')
    .upsert(statsBatch, { onConflict: 'scan_date,kingdom_id,kvk_id' });
  if (statsErr) throw new Error(`Seeds stats upsert failed: ${statsErr.message}`);

  let playersInserted = 0;
  const BATCH = 500;
  const playerRows = roster
    .filter((r) => r.kd && r.playerId)
    .map((r) => ({
      scan_date: scanDate,
      kvk_id: kvkId,
      kingdom_id: r.kd,
      player_id: r.playerId,
      name: r.name ?? '',
      power: r.power ?? 0,
      kp: r.kp ?? 0,
      cityhall: r.cityhall,
      rank_in_kd: r.rankInKd ?? 0,
    }));
  // Client-side dedupe (last row wins) — Postgres refuses upserts with
  // duplicate PK in a single batch.
  const playerByKey = new Map<string, (typeof playerRows)[number]>();
  for (const r of playerRows) playerByKey.set(`${r.kingdom_id}:${r.player_id}`, r);
  const uniquePlayerRows = [...playerByKey.values()];

  for (let i = 0; i < uniquePlayerRows.length; i += BATCH) {
    const batch = uniquePlayerRows.slice(i, i + BATCH);
    const { error: err } = await sb
      .from('seeds_kd_players')
      .upsert(batch, { onConflict: 'scan_date,kingdom_id,player_id,kvk_id' });
    if (err) throw new Error(`Seeds players upsert failed at row ${i}: ${err.message}`);
    playersInserted += batch.length;
  }

  return { kingdoms: summary.length, players: playersInserted };
}

interface DkpDatasetRow {
  id: string;
  created_at: string;
  uploaded_by: string | null;
  stats_file_name: string | null;
  honor_file_name: string | null;
  player_count: number;
  players: Player[];
  kvk_id?: string | null;
  kingdom_id?: number | null;
}

const DATASET_COLS =
  'id, created_at, uploaded_by, stats_file_name, honor_file_name, player_count, players, kvk_id, kingdom_id';

function rowToDataset(row: DkpDatasetRow): DkpDataset {
  return {
    id: row.id,
    uploadedAt: row.created_at,
    uploadedBy: row.uploaded_by,
    statsFileName: row.stats_file_name,
    honorFileName: row.honor_file_name,
    kvkId: row.kvk_id ?? null,
    kingdomId: row.kingdom_id ?? null,
    players: row.players ?? [],
  };
}

export interface DatasetFilter {
  kvkId?: string;
  kingdomId?: number;
}

/** Fetch the most recent dataset from Supabase, or null if none exists.
 *  Without a filter the most recent legacy row is returned (kept for the
 *  migration page that still scores against any roster). */
export async function loadLatestDataset(filter?: DatasetFilter): Promise<DkpDataset | null> {
  const supabase = createClient();
  let q = supabase.from('dkp_datasets').select(DATASET_COLS);
  if (filter?.kvkId) q = q.eq('kvk_id', filter.kvkId);
  if (filter?.kingdomId != null) q = q.eq('kingdom_id', filter.kingdomId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error('loadLatestDataset failed', error);
    return null;
  }
  if (!data) return null;
  return rowToDataset(data as DkpDatasetRow);
}

/** List datasets, newest first. Filter by KvK and optionally Kingdom. */
export async function listDatasets(filter: DatasetFilter): Promise<DkpDataset[]> {
  const supabase = createClient();
  let q = supabase.from('dkp_datasets').select(DATASET_COLS);
  if (filter.kvkId) q = q.eq('kvk_id', filter.kvkId);
  if (filter.kingdomId != null) q = q.eq('kingdom_id', filter.kingdomId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) {
    console.error('listDatasets failed', error);
    return [];
  }
  return (data as DkpDatasetRow[]).map(rowToDataset);
}

/** Insert a new dataset row. Returns the inserted dataset (with id + uploadedAt from the server). */
export async function saveDataset(dataset: DkpDataset): Promise<DkpDataset> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dkp_datasets')
    .insert({
      uploaded_by: dataset.uploadedBy,
      stats_file_name: dataset.statsFileName,
      honor_file_name: dataset.honorFileName,
      player_count: dataset.players.length,
      players: dataset.players,
      kvk_id: dataset.kvkId ?? null,
      kingdom_id: dataset.kingdomId ?? null,
    })
    .select(DATASET_COLS)
    .single();
  if (error) throw error;
  return rowToDataset(data as DkpDatasetRow);
}

/** Delete a dataset by id. */
export async function deleteDataset(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('dkp_datasets').delete().eq('id', id);
  if (error) throw error;
}

const CONFIG_SINGLETON_ID = 'singleton';
const MIGRATION_ID = 'migration';

/** Load a named config row from dkp_config. */
export async function loadConfigRow<T>(id: string): Promise<T | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dkp_config')
    .select('config')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error(`loadConfigRow(${id}) failed`, error);
    return null;
  }
  return (data?.config as T) ?? null;
}

/** Upsert a named config row into dkp_config. */
export async function saveConfigRow<T>(id: string, config: T): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('dkp_config')
    .upsert(
      { id, config: config as object, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (error) throw error;
}

/** Subscribe to changes on a named config row. Returns an unsubscribe function. */
export function subscribeToConfigRow<T>(
  id: string,
  onChange: (config: T) => void,
): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(`dkp_config_${id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dkp_config', filter: `id=eq.${id}` },
      (payload) => {
        const next = (payload.new as { config?: T } | null)?.config;
        if (next) onChange(next);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export const MIGRATION_ROW_ID = MIGRATION_ID;

/** Config row id for the reworked DKP page (simple formula + tiers + cutoffs).
 *  Kept separate from the legacy `singleton` row that still feeds ScansTab. */
export const SIMPLE_CONFIG_ROW_ID = 'simple';

/** Load the shared score config (weights, cutoffs, split, meta). Returns null if not yet seeded. */
export async function loadSharedConfig<T>(): Promise<T | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dkp_config')
    .select('config')
    .eq('id', CONFIG_SINGLETON_ID)
    .maybeSingle();
  if (error) {
    console.error('loadSharedConfig failed', error);
    return null;
  }
  return (data?.config as T) ?? null;
}

/** Upsert the shared score config. Officers only (gated in UI). */
export async function saveSharedConfig<T>(config: T): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('dkp_config')
    .upsert(
      { id: CONFIG_SINGLETON_ID, config: config as object, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (error) throw error;
}

/** Subscribe to remote config changes. Returns an unsubscribe function. */
export function subscribeToSharedConfig<T>(
  onChange: (config: T) => void,
): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel('dkp_config_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dkp_config', filter: `id=eq.${CONFIG_SINGLETON_ID}` },
      (payload) => {
        const next = (payload.new as { config?: T } | null)?.config;
        if (next) onChange(next);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── KvK CRUD ───────────────────────────────────────────────────────────────

export interface KvK {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  archivedAt: string | null;
}

interface KvKRow {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
}

function rowToKvK(row: KvKRow): KvK {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

/** Convention for the per-KvK config row id in dkp_config. */
export function simpleConfigIdForKvK(kvkId: string): string {
  return `simple:${kvkId}`;
}

/** List KvKs. Active first (created_at desc), archived at the end. */
export async function listKvKs(includeArchived = true): Promise<KvK[]> {
  const supabase = createClient();
  let q = supabase
    .from('dkp_kvks')
    .select('id, name, notes, created_at, archived_at');
  if (!includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) {
    console.error('listKvKs failed', error);
    return [];
  }
  return (data as KvKRow[]).map(rowToKvK);
}

export async function createKvK(name: string, notes?: string): Promise<KvK> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dkp_kvks')
    .insert({ name: name.trim(), notes: notes?.trim() || null })
    .select('id, name, notes, created_at, archived_at')
    .single();
  if (error) throw error;
  return rowToKvK(data as KvKRow);
}

export async function renameKvK(id: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('dkp_kvks')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function archiveKvK(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('dkp_kvks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function unarchiveKvK(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('dkp_kvks')
    .update({ archived_at: null })
    .eq('id', id);
  if (error) throw error;
}

/** Delete a KvK. Datasets cascade-delete via FK; the per-KvK config row is removed here. */
export async function deleteKvK(id: string): Promise<void> {
  const supabase = createClient();
  const { error: cfgErr } = await supabase
    .from('dkp_config')
    .delete()
    .eq('id', simpleConfigIdForKvK(id));
  if (cfgErr) console.error('deleteKvK: failed to drop config row', cfgErr);
  const { error } = await supabase.from('dkp_kvks').delete().eq('id', id);
  if (error) throw error;
}

/** For each kingdom in the KvK, return its most-recent dataset. */
export async function loadLatestDatasetPerKingdom(kvkId: string): Promise<DkpDataset[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dkp_datasets')
    .select(DATASET_COLS)
    .eq('kvk_id', kvkId)
    .not('kingdom_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('loadLatestDatasetPerKingdom failed', error);
    return [];
  }
  // Dedupe client-side: keep first (newest) per kingdom_id.
  const seen = new Set<number>();
  const out: DkpDataset[] = [];
  for (const row of (data ?? []) as DkpDatasetRow[]) {
    const kd = row.kingdom_id;
    if (kd == null || seen.has(kd)) continue;
    seen.add(kd);
    out.push(rowToDataset(row));
  }
  return out.sort((a, b) => (a.kingdomId ?? 0) - (b.kingdomId ?? 0));
}

/** List distinct kingdom IDs that have datasets uploaded for a given KvK. */
export async function listKingdomsForKvK(kvkId: string): Promise<number[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dkp_datasets')
    .select('kingdom_id')
    .eq('kvk_id', kvkId)
    .not('kingdom_id', 'is', null);
  if (error) {
    console.error('listKingdomsForKvK failed', error);
    return [];
  }
  const ids = new Set<number>();
  for (const row of data as { kingdom_id: number | null }[]) {
    if (row.kingdom_id != null) ids.add(row.kingdom_id);
  }
  return [...ids].sort((a, b) => a - b);
}
