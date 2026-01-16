/**
 * Script to import honor points from CSV and update existing roster members
 * Run with: npx tsx apps/web/scripts/import-honor-points.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CSV file path
const csvPath = path.join(__dirname, '../data/ang_honor_points_2026-01-16.csv');

interface CsvRow {
  rank: number;
  name: string;
  kingdom: string;
  honorPoints: number;
}

function parseCSV(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  const rows: CsvRow[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse: Rank,Name,Kingdom,Honor Points
    // Name can contain commas so we need careful parsing
    const match = line.match(/^(\d+),(.+),(#\d+),(\d+)$/);
    if (match) {
      rows.push({
        rank: parseInt(match[1]),
        name: match[2].trim(),
        kingdom: match[3],
        honorPoints: parseInt(match[4]),
      });
    }
  }

  return rows;
}

// Normalize name for matching - handles various prefixes and special chars
function normalizeName(name: string): string {
  return name
    .replace(/^\['ANG\]\s*/i, '')  // Remove ['ANG] prefix from CSV
    .replace(/^\[ANG\]\s*/i, '')   // Remove [ANG] prefix
    .replace(/^ang/i, '')          // Remove 'ang' prefix
    .replace(/^ᵃⁿᵍ/i, '')          // Remove superscript 'ang' prefix
    .replace(/^ᴬ\s*/i, '')         // Remove superscript 'A' prefix
    .toLowerCase()
    .trim();
}

// Clean the name by removing ['ANG] prefix (for display)
function cleanName(name: string): string {
  return name
    .replace(/^\['ANG\]\s*/i, '')  // Remove ['ANG] prefix
    .replace(/^\[ANG\]\s*/i, '')   // Remove [ANG] prefix
    .trim();
}

async function main() {
  console.log('Reading CSV file...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvRows = parseCSV(csvContent);
  console.log(`Parsed ${csvRows.length} rows from CSV`);

  // Get existing roster members
  console.log('\nFetching existing roster members...');
  const { data: roster, error: rosterError } = await supabase
    .from('alliance_roster')
    .select('id, name, honor_points');

  if (rosterError) {
    console.error('Error fetching roster:', rosterError);
    process.exit(1);
  }

  console.log(`Found ${roster?.length || 0} members in roster`);

  // Create maps for matching - both by exact name and normalized name
  const rosterByExact = new Map<string, { id: string; name: string; honor_points: number }>();
  const rosterByNormalized = new Map<string, { id: string; name: string; honor_points: number }>();
  for (const member of roster || []) {
    rosterByExact.set(member.name.toLowerCase(), member);
    rosterByNormalized.set(normalizeName(member.name), member);
  }

  // Match CSV rows to roster members
  const updates: { id: string; name: string; oldHonor: number; newHonor: number }[] = [];
  const notFound: string[] = [];

  for (const row of csvRows) {
    const cleanedCsvName = cleanName(row.name);
    const normalizedCsvName = normalizeName(row.name);

    // Try exact match first, then normalized match
    let member = rosterByExact.get(cleanedCsvName.toLowerCase());
    if (!member) {
      member = rosterByNormalized.get(normalizedCsvName);
    }

    if (member) {
      updates.push({
        id: member.id,
        name: member.name,
        oldHonor: member.honor_points || 0,
        newHonor: row.honorPoints,
      });
    } else {
      notFound.push(row.name);
    }
  }

  console.log(`\nMatched ${updates.length} members`);
  console.log(`Not found in roster: ${notFound.length}`);

  if (notFound.length > 0) {
    console.log('\nMembers not found (will be skipped):');
    notFound.slice(0, 10).forEach(name => console.log(`  - ${name}`));
    if (notFound.length > 10) {
      console.log(`  ... and ${notFound.length - 10} more`);
    }
  }

  // Show some sample updates
  console.log('\nSample updates:');
  updates.slice(0, 5).forEach(u => {
    const delta = u.newHonor - u.oldHonor;
    console.log(`  ${u.name}: ${u.oldHonor.toLocaleString()} → ${u.newHonor.toLocaleString()} (${delta > 0 ? '+' : ''}${delta.toLocaleString()})`);
  });

  // Confirm before proceeding
  console.log(`\nReady to update ${updates.length} members. Proceeding...`);

  // Update alliance_roster table
  console.log('\nUpdating alliance_roster...');
  let rosterUpdated = 0;
  for (const update of updates) {
    const { error } = await supabase
      .from('alliance_roster')
      .update({ honor_points: update.newHonor })
      .eq('id', update.id);

    if (error) {
      console.error(`Error updating ${update.name}:`, error);
    } else {
      rosterUpdated++;
    }
  }
  console.log(`Updated ${rosterUpdated} members in alliance_roster`);

  // Update roster_snapshots for today
  const today = new Date().toISOString().split('T')[0];
  console.log(`\nUpdating roster_snapshots for ${today}...`);

  // Get today's snapshots
  const { data: snapshots } = await supabase
    .from('roster_snapshots')
    .select('id, member_name, honor_points')
    .eq('snapshot_date', today);

  const snapshotMap = new Map<string, { id: string; honor_points: number }>();
  for (const snap of snapshots || []) {
    snapshotMap.set(snap.member_name.toLowerCase(), snap);
  }

  let snapshotsUpdated = 0;
  for (const update of updates) {
    const snap = snapshotMap.get(update.name.toLowerCase());
    if (snap) {
      const { error } = await supabase
        .from('roster_snapshots')
        .update({ honor_points: update.newHonor })
        .eq('id', snap.id);

      if (!error) snapshotsUpdated++;
    }
  }
  console.log(`Updated ${snapshotsUpdated} entries in roster_snapshots`);

  console.log('\nDone!');
}

main().catch(console.error);
