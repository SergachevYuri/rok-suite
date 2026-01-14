/**
 * Import roster from ROKstats CSV export to Supabase
 *
 * Usage:
 *   npx tsx apps/web/scripts/import-rokstats.ts [path-to-csv]
 *
 * CSV format (from ROKstats PlayersRanking export):
 *   #,Governor ID,Governor Name,Camp,KD,Power,Power Diff,KP,T4,T5,Dead,Acclaim,Healed,PTS,Trades,...
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY - Anon key (RLS allows inserts for leaders)
 *   OR SUPABASE_SERVICE_ROLE_KEY - Service role key (bypasses RLS)
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface RokstatsRow {
  rank: number;
  governor_id: number;
  name: string;
  camp: string;
  kingdom: string;
  power: number;
  kills: number;       // KP column (total kill points)
  t4_kills: number;
  t5_kills: number;
  deads: number;
  acclaim: number;
  troops_healed: number;
  kvk_points: number;  // PTS column
  trades: number;
}

// Column mapping from ROKstats CSV headers to our fields
const COLUMN_MAP: Record<string, keyof RokstatsRow> = {
  '#': 'rank',
  'governor id': 'governor_id',
  'governor name': 'name',
  'camp': 'camp',
  'kd': 'kingdom',
  'power': 'power',
  'kp': 'kills',
  't4': 't4_kills',
  't5': 't5_kills',
  'dead': 'deads',
  'acclaim': 'acclaim',
  'healed': 'troops_healed',
  'pts': 'kvk_points',
  'trades': 'trades',
};

function parseCSV(content: string): RokstatsRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

  // Build column index map
  const columnIndices: Partial<Record<keyof RokstatsRow, number>> = {};
  for (const [csvHeader, field] of Object.entries(COLUMN_MAP)) {
    const idx = headers.indexOf(csvHeader);
    if (idx !== -1) {
      columnIndices[field] = idx;
    }
  }

  console.log('Detected columns:', Object.keys(columnIndices).join(', '));

  const rows: RokstatsRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    const getValue = (field: keyof RokstatsRow): string => {
      const idx = columnIndices[field];
      return idx !== undefined ? (values[idx] || '') : '';
    };

    const name = getValue('name');
    if (!name) continue;

    const row: RokstatsRow = {
      rank: parseInt(getValue('rank'), 10) || 0,
      governor_id: parseInt(getValue('governor_id'), 10) || 0,
      name,
      camp: getValue('camp'),
      kingdom: getValue('kingdom'),
      power: parseInt(getValue('power'), 10) || 0,
      kills: parseInt(getValue('kills'), 10) || 0,
      t4_kills: parseInt(getValue('t4_kills'), 10) || 0,
      t5_kills: parseInt(getValue('t5_kills'), 10) || 0,
      deads: parseInt(getValue('deads'), 10) || 0,
      acclaim: parseInt(getValue('acclaim'), 10) || 0,
      troops_healed: parseInt(getValue('troops_healed'), 10) || 0,
      kvk_points: parseInt(getValue('kvk_points'), 10) || 0,
      trades: parseInt(getValue('trades'), 10) || 0,
    };

    rows.push(row);
  }

  return rows;
}

// Parse a single CSV line handling quoted fields
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

async function importRokstats(csvPath: string, filterKingdom?: string) {
  console.log(`Reading ROKstats CSV from: ${csvPath}`);

  const content = fs.readFileSync(csvPath, 'utf-8');
  let rows = parseCSV(content);

  console.log(`Parsed ${rows.length} total entries from CSV`);

  // Filter by kingdom if specified
  if (filterKingdom) {
    rows = rows.filter(row => row.kingdom === filterKingdom);
    console.log(`Filtered to ${rows.length} entries for kingdom ${filterKingdom}`);
  }

  if (rows.length === 0) {
    console.log('No rows to import after filtering');
    return;
  }

  // Upsert rows (update if name exists, insert if new)
  const { data, error } = await supabase
    .from('alliance_roster')
    .upsert(
      rows.map((row) => ({
        name: row.name,
        governor_id: row.governor_id || null,
        kingdom: row.kingdom || null,
        camp: row.camp || null,
        power: row.power,
        kills: row.kills,
        t4_kills: row.t4_kills,
        t5_kills: row.t5_kills,
        deads: row.deads,
        acclaim: row.acclaim,
        troops_healed: row.troops_healed,
        kvk_points: row.kvk_points,
        trades: row.trades,
        is_active: true,
      })),
      { onConflict: 'name' }
    )
    .select();

  if (error) {
    console.error('Error importing roster:', error);
    process.exit(1);
  }

  console.log(`Successfully imported/updated ${data?.length || 0} roster entries`);

  // Show summary by power
  const sorted = rows.sort((a, b) => b.power - a.power);
  console.log('\nTop 10 by power:');
  sorted.slice(0, 10).forEach((row, i) => {
    const powerM = (row.power / 1000000).toFixed(1);
    const kpM = (row.kills / 1000000).toFixed(1);
    console.log(`  ${i + 1}. ${row.name}: ${powerM}M power, ${kpM}M KP`);
  });

  // Show summary by KP
  const sortedKP = [...rows].sort((a, b) => b.kills - a.kills);
  console.log('\nTop 10 by Kill Points:');
  sortedKP.slice(0, 10).forEach((row, i) => {
    const kpM = (row.kills / 1000000).toFixed(1);
    const t4M = (row.t4_kills / 1000000).toFixed(1);
    const t5M = (row.t5_kills / 1000000).toFixed(1);
    console.log(`  ${i + 1}. ${row.name}: ${kpM}M KP (T4: ${t4M}M, T5: ${t5M}M)`);
  });
}

// Main
const args = process.argv.slice(2);
let csvPath = args.find(arg => !arg.startsWith('--')) || path.join(__dirname, '../data/PlayersRanking_20260114_081812.csv');
const kingdomArg = args.find(arg => arg.startsWith('--kingdom='));
const filterKingdom = kingdomArg ? kingdomArg.split('=')[1] : undefined;

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  console.error('\nUsage: npx tsx apps/web/scripts/import-rokstats.ts [path-to-csv] [--kingdom=3923]');
  console.error('\nOptions:');
  console.error('  --kingdom=XXXX  Filter to only import players from specified kingdom');
  process.exit(1);
}

importRokstats(csvPath, filterKingdom);
