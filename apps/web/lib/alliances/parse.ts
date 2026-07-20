// Client-side parsers for the two RoK export files that feed the Alliances page.
//
//   1. scan CSV (data/scan_3923.csv) — one row per player with an alliance tag.
//      Grouped by tag; `noally` and alliances under 5 members are excluded.
//   2. alliance-activity XLSX (data/alliance_activity_kd3923_20260720.xlsx) —
//      multiple weekly sheets; we read the first (latest week). Section-header
//      rows carry the authoritative tag / member-count / power; the following
//      member rows fill the roster.
//
// Both return `{ asOf, alliances }`. `mergeParsed` combines the two, preferring
// the XLSX for the alliance list, power and member counts.

import type { AllianceStanding, RosterMember } from './data';

export interface ParsedStandings {
  asOf: string | null;
  alliances: AllianceStanding[];
}

/** Strip a single leading apostrophe from an in-game tag ("'ANG" → "ANG"). */
export function stripTag(tag: string): string {
  return tag.replace(/^'/, '');
}

/** Pull a YYYYMMDD run out of a filename and format it YYYY-MM-DD. Null if none. */
export function asOfFromFilename(filename: string): string | null {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Minimal quote-aware CSV line splitter. These files don't use quoted commas,
 *  but we guard for it anyway. Values may contain unicode — left untouched. */
function splitCsvLine(line: string): string[] {
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
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function finalizeAlliances(alliances: AllianceStanding[]): AllianceStanding[] {
  for (const a of alliances) a.roster.sort((x, y) => y.power - x.power);
  alliances.sort((a, b) => b.power - a.power);
  return alliances;
}

/**
 * Parse the scan CSV. Header:
 *   player_id,player_name,player_power,player_kills,player_ch,player_alliance,x,y,shield_time_left
 * Groups by `player_alliance`, excludes `noally` and alliances with < 5 members.
 * Alliance power = sum of member power (the CSV has no alliance total).
 */
export function parseScanCsv(text: string, filename: string): ParsedStandings {
  const asOf = asOfFromFilename(filename);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { asOf, alliances: [] };

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const iId = header.indexOf('player_id');
  const iName = header.indexOf('player_name');
  const iPower = header.indexOf('player_power');
  const iAlliance = header.indexOf('player_alliance');
  if (iId < 0 || iAlliance < 0) {
    throw new Error(
      `Scan CSV missing expected columns (player_id, player_alliance). Found: ${header.join(', ')}`,
    );
  }

  const groups = new Map<string, RosterMember[]>();
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const tag = (cells[iAlliance] ?? '').trim();
    if (!tag || tag === 'noally') continue;
    const id = parseInt((cells[iId] ?? '').replace(/[^\d]/g, ''), 10) || 0;
    if (!id) continue;
    const name = (cells[iName] ?? '').trim();
    const power = parseInt((cells[iPower] ?? '').replace(/[^\d]/g, ''), 10) || 0;
    const bucket = groups.get(tag) ?? [];
    bucket.push({ id, name, power });
    groups.set(tag, bucket);
  }

  const alliances: AllianceStanding[] = [];
  for (const [tag, roster] of groups) {
    if (roster.length < 5) continue;
    const power = roster.reduce((s, m) => s + m.power, 0);
    alliances.push({ tag, displayTag: stripTag(tag), power, members: roster.length, roster });
  }
  return { asOf, alliances: finalizeAlliances(alliances) };
}

/**
 * Parse the alliance-activity XLSX. Uses the first sheet (latest week). Layout:
 *   row 1: title, row 3: headers, then repeating blocks of
 *   [section-header row] followed by [member rows].
 * A section-header row has an em-dash in column A and an empty column B; its
 * text is `'<TAG> — <N> members — <POWER> power`. Member rows have A=tag,
 * B=player name, C=player id, D=power.
 */
export async function parseAllianceActivityXlsx(
  arrayBuffer: ArrayBuffer,
  filename: string,
): Promise<ParsedStandings> {
  const asOf = asOfFromFilename(filename);
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return { asOf, alliances: [] };
  const sheet = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];

  const headerRe = /^(.+?)\s+—\s+([\d,]+)\s+members\s+—\s+([\d,]+)\s+power/i;
  const alliances: AllianceStanding[] = [];
  let current: AllianceStanding | null = null;

  for (const r of rows) {
    const aStr = r[0] == null ? '' : String(r[0]).trim();
    const bStr = r[1] == null ? '' : String(r[1]).trim();

    // Section-header row: em-dash in A, empty B.
    if (aStr.includes('—') && bStr === '') {
      const m = aStr.match(headerRe);
      if (m) {
        const tag = m[1].trim();
        const members = parseInt(m[2].replace(/,/g, ''), 10) || 0;
        const power = parseInt(m[3].replace(/,/g, ''), 10) || 0;
        current = { tag, displayTag: stripTag(tag), power, members, roster: [] };
        alliances.push(current);
      } else {
        // Title row or any other em-dash row that isn't a real section header.
        current = null;
      }
      continue;
    }

    // Member row: needs a name (B) and an id (C) and an open section.
    if (current && bStr !== '' && r[2] != null) {
      const id = parseInt(String(r[2]).replace(/[^\d]/g, ''), 10) || 0;
      if (!id) continue;
      const power = parseInt(String(r[3] ?? '').replace(/[^\d]/g, ''), 10) || 0;
      current.roster.push({ id, name: bStr, power });
    }
  }

  return { asOf, alliances: finalizeAlliances(alliances) };
}

/**
 * Merge parsed results from either/both files into the UNION of their alliances,
 * keyed by raw tag. The scan CSV wins on overlap — it's the fuller, per-snapshot
 * source that lists every alliance in the kingdom (the activity XLSX only covers
 * the handful of alliances in that report). Alliances that appear only in the
 * activity file are still included. Either file alone works.
 */
export function mergeParsed(
  csv: ParsedStandings | null,
  xlsx: ParsedStandings | null,
): ParsedStandings {
  const byTag = new Map<string, AllianceStanding>();
  // Seed with the activity file first so the scan overrides it on overlap.
  for (const a of xlsx?.alliances ?? []) byTag.set(a.tag, a);
  for (const a of csv?.alliances ?? []) byTag.set(a.tag, a);
  const alliances = finalizeAlliances([...byTag.values()]);
  return { asOf: csv?.asOf ?? xlsx?.asOf ?? null, alliances };
}
