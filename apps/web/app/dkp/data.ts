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
