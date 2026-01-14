import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Tag patterns to check for
const TAG_PATTERNS = ['ᵃⁿᵍ', 'ang', 'ANG'];

function hasTag(name: string): boolean {
  return TAG_PATTERNS.some(tag => name.includes(tag));
}

async function fixNames() {
  // Get all active records that have alternate_names
  const { data, error } = await supabase
    .from('alliance_roster')
    .select('id, name, alternate_names')
    .eq('is_active', true)
    .not('alternate_names', 'is', null);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data?.length} records with alternate_names\n`);

  let fixedCount = 0;

  for (const record of data || []) {
    if (!record.alternate_names || record.alternate_names.length === 0) continue;

    // Check if current name doesn't have tag but an alternate does
    const currentHasTag = hasTag(record.name);
    const taggedAlternate = record.alternate_names.find((alt: string) => hasTag(alt));

    if (!currentHasTag && taggedAlternate) {
      // Swap: use tagged name as primary, store current as alternate
      const newAlternates = [
        record.name,
        ...record.alternate_names.filter((alt: string) => alt !== taggedAlternate)
      ];

      console.log(`Swapping: "${record.name}" -> "${taggedAlternate}"`);
      console.log(`  New alternates: ${JSON.stringify(newAlternates)}`);

      const { error: updateError } = await supabase
        .from('alliance_roster')
        .update({
          name: taggedAlternate,
          alternate_names: newAlternates
        })
        .eq('id', record.id);

      if (updateError) {
        console.error(`  Error updating ${record.id}:`, updateError);
        continue;
      }

      fixedCount++;
      console.log(`  ✓ Fixed\n`);
    }
  }

  console.log(`\nDone! Fixed ${fixedCount} records to use tagged names.`);
}

fixNames();
