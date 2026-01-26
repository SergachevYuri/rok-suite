import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  // Check active roster count
  const { data: rosterData, count: rosterCount } = await supabase
    .from('alliance_roster')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  console.log(`Active roster count: ${rosterCount}`);
  console.log(`Tagged members: ${rosterData?.filter(m => m.tags && m.tags.length > 0).length}`);

  // Check Fluffy's honor points across snapshots
  const { data: fluffySnapshots } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, honor_points')
    .ilike('member_name', '%fluffy%')
    .not('member_name', 'ilike', '%queen%')
    .not('member_name', 'ilike', '%jester%')
    .not('member_name', 'ilike', '%lover%')
    .order('snapshot_date', { ascending: true });

  console.log('\nFluffy honor points by date:');
  fluffySnapshots?.forEach(s => {
    console.log(`  ${s.snapshot_date}: ${s.honor_points} (${s.member_name})`);
  });

  // Check Jan 23 snapshot count
  const { data: jan23Data, count: jan23Count } = await supabase
    .from('roster_snapshots')
    .select('*', { count: 'exact' })
    .eq('snapshot_date', '2026-01-23');

  console.log(`\nJan 23 snapshot count: ${jan23Count}`);

  // Sample Jan 23 honor points
  const { data: sampleJan23 } = await supabase
    .from('roster_snapshots')
    .select('member_name, honor_points')
    .eq('snapshot_date', '2026-01-23')
    .order('honor_points', { ascending: false })
    .limit(10);

  console.log('\nTop 10 Jan 23 honor points:');
  sampleJan23?.forEach(s => {
    console.log(`  ${s.member_name}: ${s.honor_points}`);
  });
}

debug();
