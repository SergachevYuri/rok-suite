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
 * Columns: Name, Gov ID, Power, Team 1, Team 2, Rally Leader, Garrison Leader, Mid
 * Boolean columns use "x" (case-insensitive) to indicate true.
 */
export function parseAooRegistrationCSV(text: string): AooRegistration[] {
  const { headers, rows } = parseCSV(text);

  const idx = (name: string) =>
    headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));

  const iName = idx('name');
  const iGovId = idx('gov id');
  const iPower = idx('power');
  const iTeam1 = idx('team 1');
  const iTeam2 = idx('team 2');
  const iRallyLeader = idx('rally leader');
  const iGarrisonLeader = idx('garrison leader');
  const iMid = idx('mid');

  if (iName === -1) throw new Error('Missing required "Name" column in CSV');

  const isChecked = (val: string | undefined) =>
    (val || '').trim().toLowerCase() === 'x';

  return rows
    .map(cols => ({
      name: (cols[iName] || '').trim(),
      govId: parseInt(cols[iGovId]) || 0,
      power: parseInt(cols[iPower]) || 0,
      team1: isChecked(cols[iTeam1]),
      team2: isChecked(cols[iTeam2]),
      rallyLeader: isChecked(cols[iRallyLeader]),
      garrisonLeader: isChecked(cols[iGarrisonLeader]),
      mid: isChecked(cols[iMid]),
    }))
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
