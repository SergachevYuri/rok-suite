import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  // Get all tags used
  const { data: allMembers } = await supabase
    .from('alliance_roster')
    .select('name, tags, is_active')
    .eq('is_active', true);

  // Count tags
  const tagCounts = new Map<string, number>();
  let membersWithTags = 0;
  let membersWithoutTags = 0;

  for (const m of allMembers || []) {
    if (m.tags && m.tags.length > 0) {
      membersWithTags++;
      for (const tag of m.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    } else {
      membersWithoutTags++;
    }
  }

  console.log('Tag distribution:');
  for (const [tag, count] of [...tagCounts.entries()].sort()) {
    console.log(`  ${tag}: ${count}`);
  }

  console.log(`\nMembers with tags: ${membersWithTags}`);
  console.log(`Members without tags: ${membersWithoutTags}`);

  // Sample members without tags
  const withoutTags = (allMembers || []).filter(m => !m.tags || m.tags.length === 0);
  console.log('\nSample members without tags (first 20):');
  withoutTags.slice(0, 20).forEach(m => console.log(`  - ${m.name}`));

  // Sample members with tags
  const withTags = (allMembers || []).filter(m => m.tags && m.tags.length > 0);
  console.log('\nSample members WITH tags (first 10):');
  withTags.slice(0, 10).forEach(m => console.log(`  - ${m.name}: ${m.tags?.join(', ')}`));
}

debug();
