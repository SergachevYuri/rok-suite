import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fixEventParticipationNames() {
  // Get all roster members that have alternate_names
  const { data: roster, error: rosterError } = await supabase
    .from('alliance_roster')
    .select('name, alternate_names')
    .eq('is_active', true)
    .not('alternate_names', 'eq', '{}');

  if (rosterError) {
    console.error('Error fetching roster:', rosterError);
    return;
  }

  console.log(`Found ${roster?.length} roster members with alternate names\n`);

  let updatedCount = 0;

  for (const member of roster || []) {
    if (!member.alternate_names || member.alternate_names.length === 0) continue;

    const currentName = member.name;
    const alternateNames = member.alternate_names;

    // For each alternate name, update event_participation records to use the current name
    for (const altName of alternateNames) {
      // Check if there are any event_participation records with this alternate name
      const { data: events, error: eventsError } = await supabase
        .from('event_participation')
        .select('id, member_name')
        .eq('member_name', altName);

      if (eventsError) {
        console.error(`Error checking events for "${altName}":`, eventsError);
        continue;
      }

      if (events && events.length > 0) {
        console.log(`Updating ${events.length} event records: "${altName}" -> "${currentName}"`);

        const { error: updateError } = await supabase
          .from('event_participation')
          .update({ member_name: currentName })
          .eq('member_name', altName);

        if (updateError) {
          console.error(`  Error updating:`, updateError);
          continue;
        }

        updatedCount += events.length;
        console.log(`  ✓ Updated`);
      }
    }
  }

  console.log(`\n\nDone! Updated ${updatedCount} event participation records.`);
}

fixEventParticipationNames();
