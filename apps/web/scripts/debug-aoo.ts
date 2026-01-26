import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Check aoo_strategy table
  const { data: strategies } = await supabase
    .from('aoo_strategy')
    .select('id, event_mode, aoo_team, created_at, updated_at');

  console.log('AoO Strategies:');
  console.log(strategies);

  // Check event_participation for AoO events
  const { data: events } = await supabase
    .from('event_participation')
    .select('*')
    .ilike('event_type', '%aoo%')
    .order('event_date', { ascending: false })
    .limit(20);

  console.log('\nAoO Events:');
  events?.forEach(e => console.log(`  ${e.event_date} ${e.event_type}: ${e.member_name} team=${e.team_number} participated=${e.participated}`));

  // Get unique event types
  const { data: eventTypes } = await supabase
    .from('event_participation')
    .select('event_type')
    .limit(100);

  const unique = [...new Set(eventTypes?.map(e => e.event_type))];
  console.log('\nUnique event types:', unique);
}

main();
