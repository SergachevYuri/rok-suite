import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fixMerged() {
  // Set is_active = false for all records that have merged_into set
  const { data, error } = await supabase
    .from('alliance_roster')
    .update({ is_active: false })
    .not('merged_into', 'is', null)
    .select('name');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Fixed', data?.length, 'records - set is_active = false');
  }
}

fixMerged();
