/**
 * Fix event participation names to match normalized roster names
 *
 * Names with prefixes like ᵃⁿᵍ were normalized in the roster,
 * but event_participation still has the old names.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const dryRun = process.argv.includes('--dry-run');

// Same normalization function as in cleanup-roster.ts
function normalizeName(name: string): string {
  // Remove common alliance prefixes
  const prefixes = ['ᵃⁿᵍ', 'ang', 'ᴬⁿᵍ'];
  let normalized = name.trim();
  for (const prefix of prefixes) {
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      normalized = normalized.slice(prefix.length).trim();
      break;
    }
  }
  return normalized;
}

async function fixEventNames() {
  console.log(dryRun ? 'DRY RUN - no changes will be made\n' : '');

  // Get all active roster names
  const { data: roster } = await supabase
    .from('alliance_roster')
    .select('name')
    .eq('is_active', true);

  const rosterNames = new Set((roster || []).map(r => r.name));
  console.log(`Active roster has ${rosterNames.size} members\n`);

  // Get all event participation records
  const { data: events } = await supabase
    .from('event_participation')
    .select('id, member_name');

  console.log(`Event participation has ${events?.length || 0} records\n`);

  // Find records that need updating
  const updates: { id: string; oldName: string; newName: string }[] = [];

  for (const event of events || []) {
    // If name is already in roster, no update needed
    if (rosterNames.has(event.member_name)) {
      continue;
    }

    // Try normalizing the name
    const normalizedName = normalizeName(event.member_name);

    // If normalized name is different AND exists in roster, we can update
    if (normalizedName !== event.member_name && rosterNames.has(normalizedName)) {
      updates.push({
        id: event.id,
        oldName: event.member_name,
        newName: normalizedName,
      });
    }
  }

  // Group updates by name change for cleaner output
  const nameChanges = new Map<string, { newName: string; count: number }>();
  for (const u of updates) {
    const key = u.oldName;
    const existing = nameChanges.get(key);
    if (existing) {
      existing.count++;
    } else {
      nameChanges.set(key, { newName: u.newName, count: 1 });
    }
  }

  console.log(`Name changes to make (${nameChanges.size} unique names, ${updates.length} total records):`);
  for (const [oldName, { newName, count }] of nameChanges) {
    console.log(`  "${oldName}" -> "${newName}" (${count} records)`);
  }

  if (dryRun) {
    console.log('\nDRY RUN - no changes made');
    return;
  }

  if (updates.length === 0) {
    console.log('\nNo updates needed');
    return;
  }

  // Apply updates
  console.log('\nApplying updates...');
  let success = 0;
  let errors = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from('event_participation')
      .update({ member_name: update.newName })
      .eq('id', update.id);

    if (error) {
      if (errors < 3) console.error(`Error updating ${update.oldName}:`, error.message);
      errors++;
    } else {
      success++;
    }
  }

  console.log(`\nUpdated ${success}/${updates.length} records`);
  if (errors > 0) console.log(`Errors: ${errors}`);
}

fixEventNames();
