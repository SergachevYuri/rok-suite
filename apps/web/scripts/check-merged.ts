import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  // Check a few of the merged records
  const { data } = await supabase
    .from('alliance_roster')
    .select('name, alternate_names, is_active, merged_into')
    .in('name', ['Raijin', 'Bun', 'Cain', 'BBQSGE', 'BáOo']);

  console.log('Current primary records (without tags):');
  data?.forEach(r => {
    console.log(`  "${r.name}" - alternates: ${JSON.stringify(r.alternate_names)}`);
  });

  // Check the inactive ones with tags
  const { data: inactive } = await supabase
    .from('alliance_roster')
    .select('name, is_active, merged_into')
    .eq('is_active', false)
    .not('merged_into', 'is', null)
    .limit(15);

  console.log('\nInactive merged records (with tags):');
  inactive?.forEach(r => {
    console.log(`  "${r.name}" -> merged_into: ${r.merged_into}`);
  });
}

check();
