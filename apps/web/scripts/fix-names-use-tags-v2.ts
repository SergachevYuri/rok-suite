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
  // Get all active records that have alternate_names with tags
  const { data: activeRecords, error } = await supabase
    .from('alliance_roster')
    .select('id, name, alternate_names')
    .eq('is_active', true)
    .not('alternate_names', 'is', null);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${activeRecords?.length} active records with alternate_names\n`);

  let fixedCount = 0;

  for (const record of activeRecords || []) {
    if (!record.alternate_names || record.alternate_names.length === 0) continue;

    // Check if current name doesn't have tag but an alternate does
    const currentHasTag = hasTag(record.name);
    const taggedAlternate = record.alternate_names.find((alt: string) => hasTag(alt));

    if (!currentHasTag && taggedAlternate) {
      console.log(`\nProcessing: "${record.name}" -> "${taggedAlternate}"`);

      // First, check if the tagged name exists as an inactive record
      const { data: existingTagged } = await supabase
        .from('alliance_roster')
        .select('id, name')
        .eq('name', taggedAlternate)
        .neq('id', record.id)
        .single();

      if (existingTagged) {
        // Rename the inactive record to free up the name
        const tempName = `${existingTagged.name}_merged_${Date.now()}`;
        console.log(`  Renaming inactive "${existingTagged.name}" to "${tempName}"`);

        const { error: renameError } = await supabase
          .from('alliance_roster')
          .update({ name: tempName })
          .eq('id', existingTagged.id);

        if (renameError) {
          console.error(`  Error renaming inactive record:`, renameError);
          continue;
        }
      }

      // Now swap: use tagged name as primary, store current as alternate
      const newAlternates = [
        record.name,
        ...record.alternate_names.filter((alt: string) => alt !== taggedAlternate)
      ];

      console.log(`  Swapping to: "${taggedAlternate}"`);
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
      console.log(`  ✓ Fixed`);
    }
  }

  console.log(`\n\nDone! Fixed ${fixedCount} records to use tagged names.`);
}

fixNames();
