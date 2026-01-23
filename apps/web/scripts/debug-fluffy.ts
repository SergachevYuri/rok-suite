import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  // Check roster for Fluffy Queen
  const { data: rosterData } = await supabase
    .from('alliance_roster')
    .select('name, kills, t4_kills, t5_kills, honor_points')
    .ilike('name', '%fluffy%');

  console.log('Roster entries matching "fluffy":');
  console.log(JSON.stringify(rosterData, null, 2));

  // Check snapshots for Fluffy Queen
  const { data: snapshotData } = await supabase
    .from('roster_snapshots')
    .select('member_name, snapshot_date, kills, t4_kills, t5_kills, honor_points')
    .ilike('member_name', '%fluffy%')
    .order('snapshot_date', { ascending: false });

  console.log('\nSnapshot entries matching "fluffy":');
  console.log(JSON.stringify(snapshotData, null, 2));
}

debug();
