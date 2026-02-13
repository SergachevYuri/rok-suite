/**
 * Import R4/R5 roster from CSV to Supabase
 *
 * Updates existing alliance_roster entries with governor_id, role, alliance.
 * Inserts new entries for names not already in the roster.
 *
 * Usage:
 *   npx tsx apps/web/scripts/import-r4r5-roster.ts [path-to-csv]
 *
 * CSV format:
 *   Username,Character ID,Power,Alliance,Alliance Rank
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface R4R5Row {
  name: string;
  governorId: number | null;
  power: number;
  alliance: string;
  role: string;
}

function parseCSV(content: string): R4R5Row[] {
  const lines = content.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());

  const nameIdx = header.indexOf('username');
  const idIdx = header.indexOf('character id');
  const powerIdx = header.indexOf('power');
  const allianceIdx = header.indexOf('alliance');
  const rankIdx = header.indexOf('alliance rank');

  const rows: R4R5Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());
    const name = values[nameIdx];
    if (!name) continue;

    const rawId = values[idIdx];
    const governorId = rawId ? Math.floor(parseFloat(rawId)) : null;

    rows.push({
      name,
      governorId: governorId && !isNaN(governorId) ? governorId : null,
      power: parseInt(values[powerIdx], 10) || 0,
      alliance: values[allianceIdx] || '',
      role: values[rankIdx] || '',
    });
  }

  return rows;
}

async function importR4R5(csvPath: string) {
  console.log(`Reading CSV from: ${csvPath}`);
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} R4/R5 entries\n`);

  // Fetch all existing roster members
  const { data: existing, error: fetchErr } = await supabase
    .from('alliance_roster')
    .select('id, name, governor_id, role, alliance')
    .eq('is_active', true);

  if (fetchErr) {
    console.error('Error fetching roster:', fetchErr);
    process.exit(1);
  }

  const byName = new Map<string, { id: string; name: string; governor_id: number | null; role: string | null; alliance: string | null }>();
  for (const r of existing || []) {
    byName.set(r.name, r);
  }

  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const match = byName.get(row.name);

    if (match) {
      // Update existing entry
      const updates: Record<string, unknown> = {
        role: row.role,
        alliance: row.alliance,
        power: row.power,
      };
      if (row.governorId) {
        updates.governor_id = row.governorId;
      }

      const { error } = await supabase
        .from('alliance_roster')
        .update(updates)
        .eq('id', match.id);

      if (error) {
        console.error(`  ERROR updating ${row.name}:`, error.message);
        skipped++;
      } else {
        const changes: string[] = [];
        if (match.role !== row.role) changes.push(`role: ${match.role} → ${row.role}`);
        if (match.alliance !== row.alliance) changes.push(`alliance: ${match.alliance} → ${row.alliance}`);
        if (row.governorId && match.governor_id !== row.governorId) changes.push(`gov_id: ${row.governorId}`);
        console.log(`  ✓ Updated ${row.name}${changes.length ? ' (' + changes.join(', ') + ')' : ''}`);
        updated++;
      }
    } else {
      // Insert new entry
      const { error } = await supabase
        .from('alliance_roster')
        .insert({
          name: row.name,
          power: row.power,
          governor_id: row.governorId,
          role: row.role,
          alliance: row.alliance,
          is_active: true,
          kills: 0,
          deads: 0,
        });

      if (error) {
        console.error(`  ERROR inserting ${row.name}:`, error.message);
        skipped++;
      } else {
        console.log(`  + Inserted ${row.name} (${row.role}, ${row.alliance})`);
        inserted++;
      }
    }
  }

  console.log(`\nDone: ${updated} updated, ${inserted} inserted, ${skipped} skipped`);

  // Summary by alliance
  const byAlliance = new Map<string, string[]>();
  for (const row of rows) {
    if (!byAlliance.has(row.alliance)) byAlliance.set(row.alliance, []);
    byAlliance.get(row.alliance)!.push(`${row.name} (${row.role})`);
  }
  console.log('\nBy alliance:');
  for (const [alliance, members] of [...byAlliance.entries()].sort()) {
    console.log(`  ${alliance}: ${members.length} members`);
  }
}

const csvPath = process.argv[2] || path.join(__dirname, '../data/r4r5_roster.csv');

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  process.exit(1);
}

importR4R5(csvPath);
