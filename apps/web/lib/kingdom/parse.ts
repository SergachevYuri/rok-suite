import type { SnapshotRow, KingdomExportRow, MigrantRow, InactiveRow, WantedPlayer } from './types';

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
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

/**
 * Parse Davide snapshot CSV.
 * Columns: player_id, player_name, player_power, player_kills, player_ch,
 *          player_alliance, x, y, shield_time_left
 */
export function parseSnapshotCSV(text: string): SnapshotRow[] {
  const { headers, rows } = parseCSV(text);

  const idx = (name: string) => headers.indexOf(name);
  const iId = idx('player_id');
  const iName = idx('player_name');
  const iPower = idx('player_power');
  const iKills = idx('player_kills');
  const iCh = idx('player_ch');
  const iAlliance = idx('player_alliance');
  const iX = idx('x');
  const iY = idx('y');
  const iShield = idx('shield_time_left');

  return rows
    .map(cols => ({
      playerId: parseInt(cols[iId]) || 0,
      playerName: (cols[iName] || '').trim(),
      playerPower: parseInt(cols[iPower]) || 0,
      playerKills: parseInt(cols[iKills]) || 0,
      playerCh: parseInt(cols[iCh]) || 0,
      playerAlliance: (cols[iAlliance] || '').trim(),
      x: parseInt(cols[iX]) || 0,
      y: parseInt(cols[iY]) || 0,
      shieldTimeLeft: (cols[iShield] || '').trim(),
    }))
    .filter(r => r.playerId && r.playerName);
}

/**
 * Parse kingdom stats export XLSX.
 * Dynamic import of xlsx for bundle size.
 * Handles BOM in Character ID column.
 */
export async function parseKingdomXLSX(arrayBuffer: ArrayBuffer): Promise<KingdomExportRow[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return raw
    .map(row => ({
      governorId: parseInt(row['Character ID'] || row['\uFEFFCharacter ID']) || 0,
      name: (row['Username'] || '').trim(),
      power: parseInt(row['Power']) || 0,
      highestPower: parseInt(row['Highest Power']) || 0,
      t5Deaths: parseInt(row['T5 Deaths']) || 0,
      t4Deaths: parseInt(row['T4 Deaths']) || 0,
      t3Deaths: parseInt(row['T3 Deaths']) || 0,
      t2Deaths: parseInt(row['T2 Deaths']) || 0,
      t1Deaths: parseInt(row['T1 Deaths']) || 0,
      totalKillPoints: parseInt(row['Total Kill Points']) || 0,
      t5Kills: parseInt(row['T5 Kills']) || 0,
      t4Kills: parseInt(row['T4 Kills']) || 0,
      t3Kills: parseInt(row['T3 Kills']) || 0,
      t2Kills: parseInt(row['T2 Kills']) || 0,
      t1Kills: parseInt(row['T1 Kills']) || 0,
      gathered: parseInt(row['Resources Gathered']) || 0,
      allianceHelps: parseInt(row['Alliance Helps']) || 0,
    }))
    .filter(r => r.name && r.governorId);
}

/**
 * Fetch and parse the Google Sheet migrant list as CSV.
 */
export async function fetchMigrantSheet(url: string): Promise<MigrantRow[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch migrant sheet: ${response.status}`);
  const text = await response.text();
  const { headers, rows } = parseCSV(text);

  // Fuzzy match for most columns
  const idx = (name: string) => {
    const i = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    return i;
  };
  // Exact match for "Accepted" to avoid hitting "Accepted by Slut" (col N)
  const exactIdx = (name: string) => {
    return headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());
  };

  const iName = idx('name');
  const iGovId = idx('governor id');
  const iPower = idx('power');
  const iKp = idx('kill points');
  const iT4 = idx('t4 kills');
  const iT5 = idx('t5 kills');
  const iDeads = idx('dead');
  const iKd = idx('starting kd');
  const iAlliance = idx('alliance');
  const iIllegal = exactIdx('illegal migrant');
  const iAccepted = exactIdx('accepted');
  const iGroup = idx('group');
  const iRecruiter = idx('recruiter');

  return rows
    .map(cols => ({
      name: (cols[iName] || '').trim(),
      governorId: parseInt(cols[iGovId]) || 0,
      power: parseInt(cols[iPower]) || 0,
      killPoints: parseInt(cols[iKp]) || 0,
      t4Kills: parseInt(cols[iT4]) || 0,
      t5Kills: parseInt(cols[iT5]) || 0,
      deads: parseInt(cols[iDeads]) || 0,
      startingKd: (cols[iKd] || '').trim(),
      alliance: (cols[iAlliance] || '').trim(),
      illegalMigrant: (cols[iIllegal] || '').trim(),
      accepted: (cols[iAccepted] || '').trim(),
      group: (cols[iGroup] || '').trim(),
      recruiter: (cols[iRecruiter] || '').trim(),
    }))
    .filter(r => r.name || r.governorId);
}

/**
 * Fetch and parse the Google Sheet inactives list as CSV.
 * Looks for a column containing Yes/Decrease to determine inactive status.
 */
export async function fetchInactivesSheet(url: string): Promise<InactiveRow[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch inactives sheet: ${response.status}`);
  const text = await response.text();
  const { headers, rows } = parseCSV(text);

  const idx = (name: string) => {
    return headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  };

  // "Player" column on the actual sheet, fallback to "name"
  let iName = headers.findIndex(h => h.toLowerCase().trim() === 'player');
  if (iName === -1) iName = idx('name');
  const iGovId = idx('gov id');

  // Find the inactive status column — try several possible header names
  let iInactive = headers.findIndex(h => {
    const lower = h.toLowerCase().trim();
    return lower === 'inactive' || lower === 'action' || lower.includes('migrate')
      || lower.includes('yes/no') || lower.includes('decrease');
  });
  // Fallback: look for a column that has "yes" or "decrease" values frequently
  if (iInactive === -1) {
    for (let col = 0; col < headers.length; col++) {
      if (col === iName || col === iGovId) continue;
      const vals = rows.slice(0, 20).map(r => (r[col] || '').toLowerCase().trim());
      if (vals.some(v => v === 'yes' || v === 'decrease')) {
        iInactive = col;
        break;
      }
    }
  }

  if (iInactive === -1) return [];

  return rows
    .map(cols => {
      const val = (cols[iInactive] || '').trim().toLowerCase();
      if (val !== 'yes' && val !== 'decrease') return null;
      return {
        name: (cols[iName] || '').trim(),
        governorId: parseInt(cols[iGovId]) || 0,
        inactiveReason: val as 'yes' | 'decrease',
      };
    })
    .filter((r): r is InactiveRow => r !== null && (!!r.name || !!r.governorId));
}

/**
 * Fetch and parse the Google Sheet wanted list as CSV.
 * Columns: Name, Governor ID, X Coordinate, Y Coordinate, Zero, Reason
 */
export async function fetchWantedSheet(url: string): Promise<WantedPlayer[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch wanted sheet: ${response.status}`);
  const text = await response.text();
  const { headers, rows } = parseCSV(text);

  const idx = (name: string) => {
    return headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  };

  const iGovId = idx('governor id');
  const iName = idx('name');
  const iPower1 = idx('power 1');
  const iPower2 = idx('power 2');
  const iDelta = idx('delta');
  const iX = idx('coordinate x');
  const iY = idx('coordinate y');
  const iAlliance = idx('alliance');
  const iZero = idx('zero');
  const iReason = idx('reason');
  const iZeroed = headers.findIndex(h => h.toLowerCase().trim() === 'zeroed');
  const iDisplay = idx('display');

  return rows
    .map(cols => {
      const zeroVal = (cols[iZero] || '').trim().toLowerCase();
      const zeroedVal = (cols[iZeroed] || '').trim().toLowerCase();
      const displayVal = (cols[iDisplay >= 0 ? iDisplay : -1] || '').trim().toLowerCase();
      return {
        governorId: parseInt(cols[iGovId]) || 0,
        name: (cols[iName] || '').trim(),
        power1: parseInt(cols[iPower1]) || 0,
        power2: parseInt(cols[iPower2]) || 0,
        delta: parseInt(cols[iDelta]) || 0,
        x: parseInt(cols[iX]) || 0,
        y: parseInt(cols[iY]) || 0,
        alliance: (cols[iAlliance] || '').trim(),
        zero: (zeroVal === 'yes' ? 'yes' : zeroVal === 'no' ? 'no' : '') as WantedPlayer['zero'],
        reason: (cols[iReason] || '').trim(),
        zeroed: (zeroedVal === 'yes' ? 'yes' : zeroedVal === 'no' ? 'no' : '') as WantedPlayer['zeroed'],
        display: displayVal !== 'no',
      };
    })
    .filter(r => r.name || r.governorId);
}
