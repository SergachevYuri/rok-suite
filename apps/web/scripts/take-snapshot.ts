/**
 * Take a snapshot of current roster data into roster_snapshots table
 *
 * Usage:
 *   npx tsx apps/web/scripts/take-snapshot.ts [YYYY-MM-DD]
 *
 * If no date is provided, uses today's date.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function takeSnapshot(snapshotDate: string) {
  console.log(`Taking snapshot for date: ${snapshotDate}`);

  // Fetch all active roster members
  const { data: roster, error: fetchError } = await supabase
    .from('alliance_roster')
    .select('name, power, kills, t4_kills, t5_kills, honor_points')
    .eq('is_active', true);

  if (fetchError) {
    console.error('Error fetching roster:', fetchError);
    process.exit(1);
  }

  console.log(`Found ${roster?.length || 0} active members`);

  // Check for existing snapshots on this date
  const { data: existingSnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name')
    .eq('snapshot_date', snapshotDate);

  const existingNames = new Set((existingSnapshots || []).map(s => s.member_name));
  console.log(`Found ${existingNames.size} existing snapshots for this date`);

  // Prepare snapshot data
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

  for (const member of roster || []) {
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

  console.log(`  - New snapshots to insert: ${toInsert.length}`);
  console.log(`  - Existing snapshots to update: ${toUpdate.length}`);

  // Insert new snapshots
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('roster_snapshots')
      .insert(toInsert);

    if (insertError) {
      console.error('Error inserting snapshots:', insertError);
    } else {
      console.log(`  Inserted ${toInsert.length} new snapshots`);
    }
  }

  // Update existing snapshots
  let updatedCount = 0;
  for (const snapshot of toUpdate) {
    const { error: updateError } = await supabase
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

    if (!updateError) {
      updatedCount++;
    }
  }
  console.log(`  Updated ${updatedCount} existing snapshots`);

  console.log('\nDone!');
}

// Parse date argument
const dateArg = process.argv[2];
let snapshotDate: string;

if (dateArg) {
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error('Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }
  snapshotDate = dateArg;
} else {
  // Use today's date
  snapshotDate = new Date().toISOString().split('T')[0];
}

takeSnapshot(snapshotDate);
