/**
 * Fix roster_snapshots names to match normalized roster names
 * Similar to fix-event-names.ts but for the roster_snapshots table
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

async function fixSnapshotNames() {
  console.log(dryRun ? 'DRY RUN - no changes will be made\n' : '');

  // Get all active roster names
  const { data: roster } = await supabase
    .from('alliance_roster')
    .select('name')
    .eq('is_active', true);

  const rosterNames = new Set((roster || []).map(r => r.name));
  console.log(`Active roster has ${rosterNames.size} members\n`);

  // Get all unique member names from roster_snapshots
  // Fetch in batches to avoid row limits
  let allSnapshots: { id: string; member_name: string }[] = [];
  let offset = 0;
  const FETCH_SIZE = 1000;

  while (true) {
    const { data: batch } = await supabase
      .from('roster_snapshots')
      .select('id, member_name')
      .range(offset, offset + FETCH_SIZE - 1);

    if (!batch || batch.length === 0) break;
    allSnapshots = allSnapshots.concat(batch);
    offset += FETCH_SIZE;

    if (batch.length < FETCH_SIZE) break;
  }

  const snapshots = allSnapshots;

  const uniqueSnapshotNames = new Set((snapshots || []).map(s => s.member_name));
  console.log(`Roster snapshots has ${uniqueSnapshotNames.size} unique member names (${snapshots?.length || 0} total rows)\n`);

  // Find snapshot names that don't match roster names but could be normalized
  const updates: { id: string; oldName: string; newName: string }[] = [];

  for (const snapshot of snapshots || []) {
    // If name is already in roster, no update needed
    if (rosterNames.has(snapshot.member_name)) {
      continue;
    }

    // Try normalizing the name
    const normalizedName = normalizeName(snapshot.member_name);

    // If normalized name is different AND exists in roster, we can update
    if (normalizedName !== snapshot.member_name && rosterNames.has(normalizedName)) {
      updates.push({
        id: snapshot.id,
        oldName: snapshot.member_name,
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
  for (const [oldName, { newName, count }] of [...nameChanges.entries()].slice(0, 30)) {
    console.log(`  "${oldName}" -> "${newName}" (${count} records)`);
  }
  if (nameChanges.size > 30) {
    console.log(`  ... and ${nameChanges.size - 30} more unique names`);
  }

  if (dryRun) {
    console.log('\nDRY RUN - no changes made');
    return;
  }

  if (updates.length === 0) {
    console.log('\nNo updates needed');
    return;
  }

  // Apply updates in batches
  console.log('\nApplying updates...');
  let success = 0;
  let errors = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    for (const update of batch) {
      const { error } = await supabase
        .from('roster_snapshots')
        .update({ member_name: update.newName })
        .eq('id', update.id);

      if (error) {
        if (errors < 3) console.error(`Error updating ${update.oldName}:`, error.message);
        errors++;
      } else {
        success++;
      }
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= updates.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}`);
    }
  }

  console.log(`\nUpdated ${success}/${updates.length} records`);
  if (errors > 0) console.log(`Errors: ${errors}`);
}

fixSnapshotNames();
