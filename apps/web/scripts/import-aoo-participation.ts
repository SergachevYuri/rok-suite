/**
 * Import AoO participation data from CSV
 *
 * Usage:
 *   npx tsx scripts/import-aoo-participation.ts <csv-file> <team> [date]
 *
 * Example:
 *   npx tsx scripts/import-aoo-participation.ts data/aoo_team1_participation_2026-01-24.csv "Team 1" 2026-01-24
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface CsvRow {
  rank: number;
  name: string;
  individualPoints: number;
  fortress: number;
  kills: number;
  damage: number;
  healing: number;
  participated: boolean;
}

function parseCSV(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  const rows: CsvRow[] = [];

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = header.findIndex(h => h === 'name');
  const pointsIdx = header.findIndex(h => h.includes('individual') || h.includes('points'));
  const participatedIdx = header.findIndex(h => h === 'participated');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    const name = values[nameIdx]?.trim();
    if (!name) continue;

    const participatedVal = values[participatedIdx]?.trim().toLowerCase();

    rows.push({
      rank: parseInt(values[0]) || 0,
      name,
      individualPoints: parseInt(values[pointsIdx]) || 0,
      fortress: parseInt(values[3]) || 0,
      kills: parseInt(values[4]) || 0,
      damage: parseInt(values[5]) || 0,
      healing: parseInt(values[6]) || 0,
      participated: participatedVal === 'yes' || participatedVal === 'true' || participatedVal === '1',
    });
  }

  return rows;
}

async function main() {
  const csvPath = process.argv[2];
  const team = process.argv[3] as 'Team 1' | 'Team 2';

  // Extract date from filename if not provided
  let eventDate = process.argv[4];
  if (!eventDate) {
    const match = csvPath.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      eventDate = match[1];
    } else {
      eventDate = new Date().toISOString().split('T')[0];
    }
  }

  if (!csvPath || !team) {
    console.error('Usage: npx tsx scripts/import-aoo-participation.ts <csv-file> <team> [date]');
    console.error('  team: "Team 1" or "Team 2"');
    process.exit(1);
  }

  console.log(`Importing AoO participation for ${team} on ${eventDate}`);
  console.log(`CSV: ${csvPath}\n`);

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);

  console.log(`Parsed ${rows.length} entries`);

  const participated = rows.filter(r => r.participated);
  const notParticipated = rows.filter(r => !r.participated);

  console.log(`  Participated: ${participated.length}`);
  console.log(`  Did not participate: ${notParticipated.length}\n`);

  // Prepare records
  const records = rows.map(row => ({
    member_name: row.name,
    event_type: 'aoo' as const,
    event_date: eventDate,
    team: team,
    participated: row.participated,
    score: row.individualPoints,
  }));

  // Upsert records
  const { error } = await supabase
    .from('event_participation')
    .upsert(records, {
      onConflict: 'member_name,event_type,event_date'
    });

  if (error) {
    console.error('Error inserting records:', error);
    process.exit(1);
  }

  console.log(`Successfully imported ${records.length} participation records`);

  // Show top participants
  console.log('\nTop 10 participants by score:');
  participated
    .sort((a, b) => b.individualPoints - a.individualPoints)
    .slice(0, 10)
    .forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name}: ${p.individualPoints.toLocaleString()} pts`);
    });

  console.log('\nDone!');
}

main().catch(console.error);
