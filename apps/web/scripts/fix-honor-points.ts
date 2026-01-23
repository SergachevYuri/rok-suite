/**
 * Fix honor points for a specific snapshot date
 * Usage: npx tsx scripts/fix-honor-points.ts 2026-01-23
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Get date from command line
const targetDate = process.argv[2];
if (!targetDate) {
  console.error('Usage: npx tsx scripts/fix-honor-points.ts YYYY-MM-DD');
  console.error('Example: npx tsx scripts/fix-honor-points.ts 2026-01-23');
  process.exit(1);
}

// Construct CSV path from date
const csvPath = path.join(__dirname, `../data/ang_honor_points_${targetDate}.csv`);

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  process.exit(1);
}

interface CsvRow {
  name: string;
  honorPoints: number;
}

function parseCSV(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  const rows: CsvRow[] = [];

  // Skip header: Rank,Name,Kingdom,Honor Points
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse: Rank,Name,Kingdom,Honor Points
    const match = line.match(/^(\d+),(.+),(#\d+),(\d+)$/);
    if (match) {
      rows.push({
        name: match[2].trim(),
        honorPoints: parseInt(match[4]),
      });
    }
  }

  return rows;
}

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .replace(/^\['ANG\]\s*/i, '')
    .replace(/^\[ANG\]\s*/i, '')
    .replace(/^ang\s*/i, '')
    .replace(/^ᵃⁿᵍ\s*/i, '')
    .replace(/^ᴬ\s*/i, '')
    .toLowerCase()
    .trim();
}

async function main() {
  console.log(`Fixing honor points for date: ${targetDate}`);
  console.log(`Reading CSV: ${csvPath}\n`);

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvRows = parseCSV(csvContent);
  console.log(`Parsed ${csvRows.length} rows from CSV`);

  // Get snapshots for target date
  const { data: snapshots, error: fetchError } = await supabase
    .from('roster_snapshots')
    .select('id, member_name, honor_points')
    .eq('snapshot_date', targetDate);

  if (fetchError) {
    console.error('Error fetching snapshots:', fetchError);
    process.exit(1);
  }

  console.log(`Found ${snapshots?.length || 0} snapshots for ${targetDate}\n`);

  // Create lookup maps
  const snapshotByExact = new Map<string, { id: string; member_name: string; honor_points: number }>();
  const snapshotByNormalized = new Map<string, { id: string; member_name: string; honor_points: number }>();

  for (const snap of snapshots || []) {
    snapshotByExact.set(snap.member_name.toLowerCase(), snap);
    snapshotByNormalized.set(normalizeName(snap.member_name), snap);
  }

  // Match and prepare updates
  const updates: { id: string; name: string; oldHonor: number; newHonor: number }[] = [];
  const notFound: string[] = [];

  for (const row of csvRows) {
    const normalizedCsvName = normalizeName(row.name);

    // Try exact match first, then normalized
    let snap = snapshotByExact.get(row.name.toLowerCase());
    if (!snap) {
      snap = snapshotByNormalized.get(normalizedCsvName);
    }

    if (snap) {
      if (snap.honor_points !== row.honorPoints) {
        updates.push({
          id: snap.id,
          name: snap.member_name,
          oldHonor: snap.honor_points || 0,
          newHonor: row.honorPoints,
        });
      }
    } else {
      notFound.push(row.name);
    }
  }

  console.log(`Updates needed: ${updates.length}`);
  console.log(`Not found in snapshots: ${notFound.length}\n`);

  if (notFound.length > 0 && notFound.length <= 20) {
    console.log('Names not found:');
    notFound.forEach(n => console.log(`  - ${n}`));
    console.log('');
  }

  // Show sample updates
  console.log('Sample updates:');
  updates.slice(0, 10).forEach(u => {
    const delta = u.newHonor - u.oldHonor;
    console.log(`  ${u.name}: ${u.oldHonor.toLocaleString()} → ${u.newHonor.toLocaleString()} (${delta > 0 ? '+' : ''}${delta.toLocaleString()})`);
  });
  if (updates.length > 10) {
    console.log(`  ... and ${updates.length - 10} more`);
  }

  // Apply updates
  console.log('\nApplying updates...');
  let success = 0;
  let errors = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from('roster_snapshots')
      .update({ honor_points: update.newHonor })
      .eq('id', update.id);

    if (error) {
      if (errors < 3) console.error(`Error updating ${update.name}:`, error.message);
      errors++;
    } else {
      success++;
    }
  }

  console.log(`\nUpdated ${success}/${updates.length} snapshot entries`);
  if (errors > 0) console.log(`Errors: ${errors}`);

  // Also update alliance_roster with latest honor points
  console.log('\nUpdating alliance_roster with current honor points...');

  const { data: roster } = await supabase
    .from('alliance_roster')
    .select('id, name, honor_points');

  const rosterByNormalized = new Map<string, { id: string; name: string; honor_points: number }>();
  for (const member of roster || []) {
    rosterByNormalized.set(normalizeName(member.name), member);
  }

  let rosterUpdates = 0;
  for (const row of csvRows) {
    const normalizedName = normalizeName(row.name);
    const member = rosterByNormalized.get(normalizedName);

    if (member && member.honor_points !== row.honorPoints) {
      const { error } = await supabase
        .from('alliance_roster')
        .update({ honor_points: row.honorPoints })
        .eq('id', member.id);

      if (!error) rosterUpdates++;
    }
  }

  console.log(`Updated ${rosterUpdates} members in alliance_roster`);
  console.log('\nDone!');
}

main().catch(console.error);
