import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// More comprehensive clan tag list
const CLAN_TAGS = [
  'ᵃⁿᵍ', 'ᵏᵏ', 'кк', 'К҉к҉', 'K҉k҉', '๛', 'ᴬᶜ', '҉', 'ккк', 'ᵏᵏᵏ',
  'ang', 'ANG', 'кк ', 'кк', ' кк'
];

function stripTags(name: string): string {
  let clean = name;
  for (const tag of CLAN_TAGS) {
    clean = clean.replaceAll(tag, '');
  }
  // Normalize unicode and remove diacritics
  clean = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // Remove any remaining non-alphanumeric except spaces
  clean = clean.replace(/[^\w\s]/g, '');
  return clean.trim().toLowerCase();
}

async function mergeAllDupes() {
  const { data: roster, error } = await supabase
    .from('alliance_roster')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total active records: ${roster?.length}\n`);

  // Group by stripped name
  const groups = new Map<string, typeof roster>();

  for (const member of roster!) {
    const key = stripTags(member.name);
    if (!key || key.length < 2) continue;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(member);
  }

  // Find groups with multiple entries
  const duplicates = Array.from(groups.entries())
    .filter(([_, members]) => members.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Found ${duplicates.length} duplicate groups to merge:\n`);

  let mergedCount = 0;

  for (const [key, members] of duplicates) {
    // Sort by power descending - keep the one with highest power as primary
    members.sort((a, b) => (b.power || 0) - (a.power || 0));

    const primary = members[0];
    const duplicatesToMerge = members.slice(1);

    console.log(`\nMerging "${key}":`);
    console.log(`  Primary: "${primary.name}" - Power: ${((primary.power || 0)/1000000).toFixed(1)}M, KP: ${((primary.kills || 0)/1000000).toFixed(1)}M`);

    for (const duplicate of duplicatesToMerge) {
      console.log(`  Merging: "${duplicate.name}" - Power: ${((duplicate.power || 0)/1000000).toFixed(1)}M, KP: ${((duplicate.kills || 0)/1000000).toFixed(1)}M`);

      // Merge stats (take max)
      const merged = {
        power: Math.max(primary.power || 0, duplicate.power || 0),
        kills: Math.max(primary.kills || 0, duplicate.kills || 0),
        t1_kills: Math.max(primary.t1_kills || 0, duplicate.t1_kills || 0),
        t2_kills: Math.max(primary.t2_kills || 0, duplicate.t2_kills || 0),
        t3_kills: Math.max(primary.t3_kills || 0, duplicate.t3_kills || 0),
        t4_kills: Math.max(primary.t4_kills || 0, duplicate.t4_kills || 0),
        t5_kills: Math.max(primary.t5_kills || 0, duplicate.t5_kills || 0),
        deads: Math.max(primary.deads || 0, duplicate.deads || 0),
        honor_points: Math.max(primary.honor_points || 0, duplicate.honor_points || 0),
        troops_healed: Math.max(primary.troops_healed || 0, duplicate.troops_healed || 0),
        acclaim: Math.max(primary.acclaim || 0, duplicate.acclaim || 0),
        kvk_points: Math.max(primary.kvk_points || 0, duplicate.kvk_points || 0),
        highest_power: Math.max(primary.highest_power || 0, duplicate.highest_power || 0),
        role: primary.role || duplicate.role,
        tier: primary.tier || duplicate.tier,
        tags: [...new Set([...(primary.tags || []), ...(duplicate.tags || [])])],
        alternate_names: [...new Set([...(primary.alternate_names || []), duplicate.name])],
        governor_id: primary.governor_id || duplicate.governor_id,
      };

      // Update primary with merged stats
      const { error: updateError } = await supabase
        .from('alliance_roster')
        .update(merged)
        .eq('id', primary.id);

      if (updateError) {
        console.error(`  Error updating primary ${primary.id}:`, updateError);
        continue;
      }

      // Update primary object for next iteration if there are more duplicates
      Object.assign(primary, merged);

      // Mark duplicate as inactive
      const { error: mergeError } = await supabase
        .from('alliance_roster')
        .update({ is_active: false, merged_into: primary.id })
        .eq('id', duplicate.id);

      if (mergeError) {
        console.error(`  Error marking duplicate ${duplicate.id} inactive:`, mergeError);
        continue;
      }

      mergedCount++;
      console.log(`  ✓ Merged successfully`);
    }
  }

  console.log(`\n\nDone! Merged ${mergedCount} duplicate records.`);
}

mergeAllDupes();
