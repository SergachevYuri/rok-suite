/**
 * Fix 0 values in snapshots - replace with null when not explicitly entered
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const snapshotDate = process.argv[2] || '2026-01-23';
  console.log(`Fixing zero values for date: ${snapshotDate}`);

  // Check sample data first
  const { data: sample } = await supabase
    .from('roster_snapshots')
    .select('member_name, kills, t4_kills, t5_kills, honor_points')
    .eq('snapshot_date', snapshotDate)
    .limit(5);
  console.log('Sample data:', sample);

  // Get all snapshots for this date
  const { data: snapshots, error: fetchError } = await supabase
    .from('roster_snapshots')
    .select('id, member_name, kills, t4_kills, t5_kills, honor_points')
    .eq('snapshot_date', snapshotDate);

  if (fetchError) {
    console.error('Error fetching:', fetchError);
    process.exit(1);
  }

  console.log(`Found ${snapshots?.length || 0} snapshots for this date`);

  // Count how many have all zeros vs some non-zero values
  let allZeros = 0;
  let someNonZero = 0;
  for (const snap of snapshots || []) {
    if (snap.kills === 0 && snap.t4_kills === 0 && snap.t5_kills === 0 && snap.honor_points === 0) {
      allZeros++;
    } else {
      someNonZero++;
    }
  }
  console.log(`  All zeros: ${allZeros}`);
  console.log(`  Some non-zero: ${someNonZero}`);

  // Update ones where all combat stats are 0 (meaning they weren't provided)
  let updated = 0;
  let errors = 0;
  for (const snap of snapshots || []) {
    if (snap.kills === 0 && snap.t4_kills === 0 && snap.t5_kills === 0 && snap.honor_points === 0) {
      const { error, data } = await supabase
        .from('roster_snapshots')
        .update({
          kills: null,
          t4_kills: null,
          t5_kills: null,
          honor_points: null,
        })
        .eq('id', snap.id)
        .select();

      if (error) {
        if (errors < 3) console.error('Update error:', error);
        errors++;
      } else {
        updated++;
      }
    }
  }

  console.log(`Updated ${updated} snapshots (set 0s to null)`);
  if (errors > 0) console.log(`Errors: ${errors}`);
}

fix();
