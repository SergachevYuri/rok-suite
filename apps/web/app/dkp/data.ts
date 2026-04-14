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
}

function rowToDataset(row: DkpDatasetRow): DkpDataset {
  return {
    id: row.id,
    uploadedAt: row.created_at,
    uploadedBy: row.uploaded_by,
    statsFileName: row.stats_file_name,
    honorFileName: row.honor_file_name,
    players: row.players ?? [],
  };
}

/** Fetch the most recent dataset from Supabase, or null if none exists. */
export async function loadLatestDataset(): Promise<DkpDataset | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dkp_datasets')
    .select('id, created_at, uploaded_by, stats_file_name, honor_file_name, player_count, players')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('loadLatestDataset failed', error);
    return null;
  }
  if (!data) return null;
  return rowToDataset(data as DkpDatasetRow);
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
    })
    .select('id, created_at, uploaded_by, stats_file_name, honor_file_name, player_count, players')
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
