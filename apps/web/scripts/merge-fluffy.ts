import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function mergeFluffy() {
  // Primary: ᵃⁿᵍFluffy (decorated name)
  const primaryId = 'e8d001f8-ebe0-4e92-9d8a-4c7162a40f4f';
  // Duplicate: Fluffy (plain name)
  const duplicateId = 'ba92ef58-67d4-412d-a5e0-065d7882d39a';

  // Get both records
  const { data: records } = await supabase
    .from('alliance_roster')
    .select('*')
    .in('id', [primaryId, duplicateId]);

  if (!records || records.length !== 2) {
    console.error('Could not find both records');
    return;
  }

  const primary = records.find(r => r.id === primaryId)!;
  const duplicate = records.find(r => r.id === duplicateId)!;

  console.log('Merging:');
  console.log(`  Primary: "${primary.name}" - Power: ${(primary.power/1000000).toFixed(1)}M, KP: ${((primary.kills||0)/1000000).toFixed(1)}M`);
  console.log(`  Duplicate: "${duplicate.name}" - Power: ${(duplicate.power/1000000).toFixed(1)}M, KP: ${((duplicate.kills||0)/1000000).toFixed(1)}M`);

  // Merge stats (take max)
  const merged = {
    power: Math.max(primary.power || 0, duplicate.power || 0),
    kills: Math.max(primary.kills || 0, duplicate.kills || 0),
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
    alternate_names: [duplicate.name],
    governor_id: primary.governor_id || duplicate.governor_id,
  };

  console.log(`\n  Merged: Power: ${(merged.power/1000000).toFixed(1)}M, KP: ${(merged.kills/1000000).toFixed(1)}M`);

  // Update primary
  const { error: updateError } = await supabase
    .from('alliance_roster')
    .update(merged)
    .eq('id', primaryId);

  if (updateError) {
    console.error('Error updating primary:', updateError);
    return;
  }

  // Mark duplicate as inactive
  const { error: mergeError } = await supabase
    .from('alliance_roster')
    .update({ is_active: false, merged_into: primaryId })
    .eq('id', duplicateId);

  if (mergeError) {
    console.error('Error marking duplicate inactive:', mergeError);
    return;
  }

  console.log('\nDone! Fluffy merged successfully.');
}

mergeFluffy();
