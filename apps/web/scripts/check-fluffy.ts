import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkFluffy() {
  const { data, error } = await supabase
    .from('alliance_roster')
    .select('id, name, is_active, merged_into, alternate_names, power, kills')
    .ilike('name', '%fluffy%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Records matching "fluffy":');
  data?.forEach(m => {
    console.log(`  - "${m.name}"`);
    console.log(`    ID: ${m.id}`);
    console.log(`    is_active: ${m.is_active}`);
    console.log(`    merged_into: ${m.merged_into}`);
    console.log(`    alternate_names: ${JSON.stringify(m.alternate_names)}`);
    console.log(`    power: ${(m.power/1000000).toFixed(1)}M, KP: ${((m.kills||0)/1000000).toFixed(1)}M`);
    console.log('');
  });
}

checkFluffy();
