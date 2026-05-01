import type { AooRegistration } from './types';

/** Parse a CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/** Parse CSV text into header + row arrays */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

/**
 * Convert a Google Sheets edit URL to a CSV export URL.
 * Accepts both edit and export URLs.
 */
export function toExportUrl(sheetUrl: string): string {
  // Already an export URL
  if (sheetUrl.includes('/export?')) return sheetUrl;

  // Extract spreadsheet ID and gid
  const idMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const gidMatch = sheetUrl.match(/gid=(\d+)/);
  if (!idMatch) throw new Error('Invalid Google Sheets URL');

  const base = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`;
  return gidMatch ? `${base}&gid=${gidMatch[1]}` : base;
}

/**
 * Parse CSV text into AoO registrations.
 * Columns: Name, Gov ID, Power, Team 1, Team 2, Rally Leader, Garrison Leader, Mid, Lane
 * Boolean columns use "x" (case-insensitive) to indicate true.
 * Lane is an integer (1=Top, 2=Mid, 3=Bottom). Cells like "rally"/"garrison"/"ark"
 * that appear under the Lane column instead of in their own columns are also honored.
 */
export function parseAooRegistrationCSV(text: string): AooRegistration[] {
  const { headers, rows } = parseCSV(text);

  // Use exact column-name matching (instead of `includes`) to avoid false hits
  // — e.g. "Mid" would match "Mid Lane" if we used `includes`.
  const idx = (...names: string[]) => {
    const wants = names.map(n => n.toLowerCase().trim());
    return headers.findIndex(h => wants.includes(h.toLowerCase().trim()));
  };

  const iName = idx('name');
  const iGovId = idx('gov id', 'governor id', 'govid');
  const iPower = idx('power');
  const iTeam1 = idx('team 1', 'team1', 't1');
  const iTeam2 = idx('team 2', 'team2', 't2');
  const iRallyLeader = idx('rally leader', 'rally');
  const iGarrisonLeader = idx('garrison leader', 'garrison');
  const iMid = idx('mid', 'ark');
  const iSub = idx('sub', 'substitute');
  const iCoordinator = idx('coordinator', 'coord');
  const iLane = idx('lane', 'zone');

  if (iName === -1) throw new Error('Missing required "Name" column in CSV');

  const isChecked = (val: string | undefined) =>
    (val || '').trim().toLowerCase() === 'x';

  // Parse the Lane cell: "1", "2", "3", "top", "mid", "bottom".
  // Also accept role-like values ("rally"/"garrison"/"ark") so admins can use one
  // column to express both lane number and role; those flags are merged below.
  const parseLane = (val: string | undefined): { lane: number | null; rally: boolean; garrison: boolean; mid: boolean } => {
    const v = (val || '').trim().toLowerCase();
    if (!v) return { lane: null, rally: false, garrison: false, mid: false };
    if (v === '1' || v === 'top' || v === 'top lane') return { lane: 1, rally: false, garrison: false, mid: false };
    if (v === '2' || v === 'mid' || v === 'middle' || v === 'mid lane' || v === 'ark') return { lane: 2, rally: false, garrison: false, mid: v === 'ark' };
    if (v === '3' || v === 'bot' || v === 'bottom' || v === 'bottom lane') return { lane: 3, rally: false, garrison: false, mid: false };
    if (v === 'rally') return { lane: null, rally: true, garrison: false, mid: false };
    if (v === 'garrison') return { lane: null, rally: false, garrison: true, mid: false };
    return { lane: null, rally: false, garrison: false, mid: false };
  };

  return rows
    .map(cols => {
      const laneCell = parseLane(cols[iLane]);
      return {
        name: (cols[iName] || '').trim(),
        govId: parseInt(cols[iGovId]) || 0,
        power: parseInt(cols[iPower]) || 0,
        team1: isChecked(cols[iTeam1]),
        team2: isChecked(cols[iTeam2]),
        rallyLeader: isChecked(cols[iRallyLeader]) || laneCell.rally,
        garrisonLeader: isChecked(cols[iGarrisonLeader]) || laneCell.garrison,
        mid: isChecked(cols[iMid]) || laneCell.mid,
        sub: isChecked(cols[iSub]),
        coordinator: isChecked(cols[iCoordinator]),
        lane: laneCell.lane,
      };
    })
    .filter(r => r.name);
}

/**
 * Fetch and parse an AoO registration Google Sheet as CSV.
 */
export async function fetchAooRegistrationSheet(sheetUrl: string): Promise<AooRegistration[]> {
  const exportUrl = toExportUrl(sheetUrl);
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.status}`);
  const text = await response.text();
  return parseAooRegistrationCSV(text);
}
