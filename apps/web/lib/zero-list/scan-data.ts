// Data layer for the Zero List feature: kingdom-scan reads, scan-compare,
// scan-player → DKP-Player adapter, migrant-CSV parser.

import { createClient } from '@/lib/supabase/client';
import type { Scan, ScanPlayer } from '@/lib/kingdom/types';
import type { Player as DkpPlayer } from '@/app/dkp/data';

// ─── Scan reads ─────────────────────────────────────────────────────────────

export async function listScans(): Promise<Scan[]> {
  const { data, error } = await createClient()
    .from('kingdom_scans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Scan[];
}

/** Load all players for a scan, paginating past Supabase's 1000-row default. */
export async function loadScanPlayers(scanId: number): Promise<ScanPlayer[]> {
  const sb = createClient();
  let all: ScanPlayer[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('kingdom_scan_players')
      .select('*')
      .eq('scan_id', scanId)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data as ScanPlayer[]);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// ─── ScanPlayer → DKP Player adapter ────────────────────────────────────────

/** Map a kingdom-scan row into the shape DKP scoring expects. Notes:
 *  - kingdom_scan_players doesn't track per-tier deaths, so all deaths land in t5Deaths.
 *    This biases scoring slightly toward T5 bands but is the cleanest single-source story.
 *  - honor_points isn't on kingdom_scan_players either. Defaults to 0; the honor formula
 *    weight will simply contribute 0 to the score for kingdom-scan inputs.
 */
export function scanPlayerToDkpPlayer(p: ScanPlayer): DkpPlayer {
  return {
    characterId: p.governor_id,
    username: p.name,
    power: p.power ?? 0,
    highestPower: p.highest_power ?? 0,
    t5Deaths: p.deaths ?? 0,
    t4Deaths: 0,
    totalKP: p.kill_points ?? 0,
    t5Kills: p.t5_kills ?? 0,
    t4Kills: p.t4_kills ?? 0,
    rssGathered: p.gathered ?? 0,
    allianceHelps: p.alliance_helps ?? 0,
    dkp: 0,
    honorPoints: 0,
  };
}

// ─── Scan compare ───────────────────────────────────────────────────────────

export interface ScanCompareGrower {
  governorId: number;
  name: string;
  alliance: string | null;
  powerA: number;
  powerB: number;
  deltaPower: number;
  /** Latest x/y from scan B if available. */
  x: number | null;
  y: number | null;
}

export interface ScanCompareEntry {
  governorId: number;
  name: string;
  alliance: string | null;
  power: number;
  x: number | null;
  y: number | null;
}

export interface ScanCompareResult {
  growers: ScanCompareGrower[];
  shrinkers: ScanCompareGrower[];
  newPlayers: ScanCompareEntry[];
  departed: ScanCompareEntry[];
}

/** Compare two scans, identifying growers, shrinkers, new arrivals, and departures.
 *  Match is by governor_id only (catches name changes; misses account merges, which are rare). */
export function compareScans(
  scanA: ScanPlayer[],
  scanB: ScanPlayer[],
  options: { growerThreshold?: number } = {},
): ScanCompareResult {
  const threshold = options.growerThreshold ?? 0;
  const byA = new Map<number, ScanPlayer>();
  for (const p of scanA) byA.set(p.governor_id, p);
  const byB = new Map<number, ScanPlayer>();
  for (const p of scanB) byB.set(p.governor_id, p);

  const growers: ScanCompareGrower[] = [];
  const shrinkers: ScanCompareGrower[] = [];
  const newPlayers: ScanCompareEntry[] = [];
  const departed: ScanCompareEntry[] = [];

  for (const [id, b] of byB) {
    const a = byA.get(id);
    if (!a) {
      newPlayers.push({
        governorId: id,
        name: b.name,
        alliance: b.current_alliance || null,
        power: b.power ?? 0,
        x: b.x,
        y: b.y,
      });
      continue;
    }
    const delta = (b.power ?? 0) - (a.power ?? 0);
    if (delta > threshold) {
      growers.push({
        governorId: id,
        name: b.name,
        alliance: b.current_alliance || null,
        powerA: a.power ?? 0,
        powerB: b.power ?? 0,
        deltaPower: delta,
        x: b.x,
        y: b.y,
      });
    } else if (delta < -threshold) {
      shrinkers.push({
        governorId: id,
        name: b.name,
        alliance: b.current_alliance || null,
        powerA: a.power ?? 0,
        powerB: b.power ?? 0,
        deltaPower: delta,
        x: b.x,
        y: b.y,
      });
    }
  }
  for (const [id, a] of byA) {
    if (!byB.has(id)) {
      departed.push({
        governorId: id,
        name: a.name,
        alliance: a.current_alliance || null,
        power: a.power ?? 0,
        x: a.x,
        y: a.y,
      });
    }
  }
  growers.sort((a, b) => b.deltaPower - a.deltaPower);
  shrinkers.sort((a, b) => a.deltaPower - b.deltaPower);
  newPlayers.sort((a, b) => b.power - a.power);
  departed.sort((a, b) => b.power - a.power);
  return { growers, shrinkers, newPlayers, departed };
}

// ─── Migrant CSV parser ─────────────────────────────────────────────────────

export type MigrantDecision = 'yes' | 'no' | 'maybe' | 'unknown';

export interface MigrantDecisionRow {
  governorId: number;
  decision: MigrantDecision;
  /** Original row number (1-indexed, after header) for error reporting. */
  row: number;
}

/** Parse a CSV export of the migrant-applications sheet. Looks for two columns by header name:
 *  "Governor ID" and "Decision". Tolerant of header variations (case, surrounding text). */
export function parseMigrantCsv(text: string): { rows: MigrantDecisionRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: ['CSV is empty'] };
  const headerCells = parseCsvLine(lines[0]);
  const govIdx = findHeaderIndex(headerCells, ['governor id', 'gov id', 'governorid']);
  const decIdx = findHeaderIndex(headerCells, ['decision', 'decision (yes, no, maybe)']);
  const errors: string[] = [];
  if (govIdx < 0) errors.push('CSV is missing a "Governor ID" column.');
  if (decIdx < 0) errors.push('CSV is missing a "Decision" column.');
  if (errors.length > 0) return { rows: [], errors };
  const rows: MigrantDecisionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const idRaw = (cells[govIdx] ?? '').trim();
    const decRaw = (cells[decIdx] ?? '').trim().toLowerCase();
    if (!idRaw) continue;
    const id = Number(idRaw.replace(/\D/g, ''));
    if (!Number.isFinite(id) || id <= 0) continue;
    let decision: MigrantDecision = 'unknown';
    if (decRaw.startsWith('y')) decision = 'yes';
    else if (decRaw.startsWith('n')) decision = 'no';
    else if (decRaw.startsWith('m')) decision = 'maybe';
    rows.push({ governorId: id, decision, row: i + 1 });
  }
  return { rows, errors };
}

function findHeaderIndex(cells: string[], aliases: string[]): number {
  const norm = cells.map((c) => c.trim().toLowerCase().replace(/\s+/g, ' '));
  for (let i = 0; i < norm.length; i++) {
    for (const a of aliases) {
      if (norm[i] === a || norm[i].startsWith(a)) return i;
    }
  }
  return -1;
}

/** Minimal CSV line parser that handles quoted values containing commas + escaped quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}
