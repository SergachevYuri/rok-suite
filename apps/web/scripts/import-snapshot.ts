/**
 * Import roster and honor points data, then create a snapshot
 *
 * Usage:
 *   npx tsx scripts/import-snapshot.ts <roster-csv> <honor-csv> [date]
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

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .replace(/^\[.?ANG\]\s*/i, '')
    .replace(/^ang\s*/i, '')
    .replace(/^ᵃⁿᵍ\s*/i, '')
    .replace(/^ᴷᴷ\s*/i, '')
    .replace(/^ᴿᵁ\s*/i, '')
    .replace(/^ᵛⁿ\s*/i, '')
    .replace(/^ᵛᵒ\s*/i, '')
    .replace(/^ᴱᶠ\s*/i, '')
    .replace(/^ᴰᴿ\s*/i, '')
    .replace(/^ᴵᴸ\s*/i, '')
    .replace(/✖/g, '')
    .replace(/乄/g, '')
    .toLowerCase()
    .trim();
}

interface RosterRow {
  name: string;
  power: number;
  rank: string | null;
}

interface HonorRow {
  name: string;
  honorPoints: number;
}

function parseRosterCSV(content: string): RosterRow[] {
  const lines = content.trim().split('\n');
  const rows: RosterRow[] = [];

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const powerIdx = header.indexOf('power');
  const rankIdx = header.indexOf('rank');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    const name = values[nameIdx]?.trim();
    if (!name) continue;

    rows.push({
      name,
      power: parseInt(values[powerIdx]) || 0,
      rank: values[rankIdx]?.trim() || null,
    });
  }

  return rows;
}

function parseHonorCSV(content: string): HonorRow[] {
  const lines = content.trim().split('\n');
  const rows: HonorRow[] = [];

  // Parse header to find columns
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const honorIdx = header.findIndex(h => h.includes('honor'));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    const name = values[nameIdx]?.trim();
    if (!name) continue;

    rows.push({
      name,
      honorPoints: parseInt(values[honorIdx]) || 0,
    });
  }

  return rows;
}

async function main() {
  const rosterPath = process.argv[2];
  const honorPath = process.argv[3];
  const snapshotDate = process.argv[4] || new Date().toISOString().split('T')[0];

  if (!rosterPath || !honorPath) {
    console.error('Usage: npx tsx scripts/import-snapshot.ts <roster-csv> <honor-csv> [date]');
    process.exit(1);
  }

  console.log(`Importing data for snapshot date: ${snapshotDate}\n`);

  // Parse CSV files
  const rosterContent = fs.readFileSync(rosterPath, 'utf-8');
  const honorContent = fs.readFileSync(honorPath, 'utf-8');

  const rosterRows = parseRosterCSV(rosterContent);
  const honorRows = parseHonorCSV(honorContent);

  console.log(`Parsed ${rosterRows.length} roster entries`);
  console.log(`Parsed ${honorRows.length} honor entries`);

  // Get existing roster from database
  const { data: existing } = await supabase
    .from('alliance_roster')
    .select('id, name, power, honor_points, alternate_names')
    .eq('is_active', true);

  // Build lookup maps
  const memberByNorm = new Map<string, { id: string; name: string; power: number; honor_points: number }>();
  for (const m of existing || []) {
    memberByNorm.set(normalizeName(m.name), m);
    // Also index by alternate names
    for (const alt of m.alternate_names || []) {
      memberByNorm.set(normalizeName(alt), m);
    }
  }

  console.log(`Found ${existing?.length || 0} existing members\n`);

  // Build updates from roster CSV (power)
  const updates = new Map<string, { id: string; name: string; power?: number; honor_points?: number }>();

  for (const row of rosterRows) {
    const norm = normalizeName(row.name);
    const member = memberByNorm.get(norm);
    if (member) {
      updates.set(member.id, {
        id: member.id,
        name: member.name,
        power: row.power,
      });
    }
  }

  // Add honor points updates
  for (const row of honorRows) {
    const norm = normalizeName(row.name);
    const member = memberByNorm.get(norm);
    if (member) {
      const existing = updates.get(member.id);
      if (existing) {
        existing.honor_points = row.honorPoints;
      } else {
        updates.set(member.id, {
          id: member.id,
          name: member.name,
          honor_points: row.honorPoints,
        });
      }
    }
  }

  console.log(`Updating ${updates.size} members...\n`);

  // Show sample updates
  const samples = Array.from(updates.values()).slice(0, 5);
  console.log('Sample updates:');
  for (const u of samples) {
    const powerStr = u.power ? `${(u.power / 1000000).toFixed(1)}M` : '-';
    const honorStr = u.honor_points ? u.honor_points.toLocaleString() : '-';
    console.log(`  ${u.name}: power=${powerStr}, honor=${honorStr}`);
  }

  // Update alliance_roster
  console.log('\nUpdating alliance_roster...');
  let rosterUpdated = 0;
  for (const update of updates.values()) {
    const updateData: Record<string, number> = {};
    if (update.power !== undefined) updateData.power = update.power;
    if (update.honor_points !== undefined) updateData.honor_points = update.honor_points;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('alliance_roster')
        .update(updateData)
        .eq('id', update.id);

      if (!error) rosterUpdated++;
    }
  }
  console.log(`Updated ${rosterUpdated} members`);

  // Create/update snapshot
  console.log(`\nCreating snapshot for ${snapshotDate}...`);

  // Fetch updated roster data
  const { data: updatedRoster } = await supabase
    .from('alliance_roster')
    .select('name, power, kills, t4_kills, t5_kills, honor_points')
    .eq('is_active', true);

  // Check existing snapshots
  const { data: existingSnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name')
    .eq('snapshot_date', snapshotDate);

  const existingNames = new Set((existingSnapshots || []).map(s => s.member_name));

  const toInsert: Array<{
    member_name: string;
    snapshot_date: string;
    power: number;
    kills: number;
    t4_kills: number;
    t5_kills: number;
    honor_points: number;
  }> = [];

  const toUpdate: Array<{
    member_name: string;
    power: number;
    kills: number;
    t4_kills: number;
    t5_kills: number;
    honor_points: number;
  }> = [];

  for (const member of updatedRoster || []) {
    const snapshotData = {
      member_name: member.name,
      snapshot_date: snapshotDate,
      power: member.power || 0,
      kills: member.kills || 0,
      t4_kills: member.t4_kills || 0,
      t5_kills: member.t5_kills || 0,
      honor_points: member.honor_points || 0,
    };

    if (existingNames.has(member.name)) {
      toUpdate.push(snapshotData);
    } else {
      toInsert.push(snapshotData);
    }
  }

  console.log(`  New snapshots: ${toInsert.length}`);
  console.log(`  Updates: ${toUpdate.length}`);

  // Insert new snapshots
  if (toInsert.length > 0) {
    const { error } = await supabase.from('roster_snapshots').insert(toInsert);
    if (error) console.error('Insert error:', error);
  }

  // Update existing snapshots
  let snapshotsUpdated = 0;
  for (const snapshot of toUpdate) {
    const { error } = await supabase
      .from('roster_snapshots')
      .update({
        power: snapshot.power,
        kills: snapshot.kills,
        t4_kills: snapshot.t4_kills,
        t5_kills: snapshot.t5_kills,
        honor_points: snapshot.honor_points,
      })
      .eq('member_name', snapshot.member_name)
      .eq('snapshot_date', snapshotDate);

    if (!error) snapshotsUpdated++;
  }
  console.log(`  Updated ${snapshotsUpdated} snapshots`);

  console.log('\nDone!');
}

main().catch(console.error);
