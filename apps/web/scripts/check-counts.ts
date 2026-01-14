import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkCounts() {
  const { data: all } = await supabase.from('alliance_roster').select('id');
  const { data: active } = await supabase.from('alliance_roster').select('id').eq('is_active', true);
  const { data: inactive } = await supabase.from('alliance_roster').select('id').eq('is_active', false);
  const { data: merged } = await supabase.from('alliance_roster').select('id, name, merged_into, is_active').not('merged_into', 'is', null);

  console.log('Total records:', all?.length);
  console.log('Active (is_active=true):', active?.length);
  console.log('Inactive (is_active=false):', inactive?.length);
  console.log('Has merged_into set:', merged?.length);

  if (merged && merged.length > 0) {
    console.log('\nSample merged records (showing is_active status):');
    merged.slice(0, 5).forEach(m => console.log(`  - ${m.name} | is_active: ${m.is_active} | merged_into: ${m.merged_into}`));
  }
}

checkCounts();
