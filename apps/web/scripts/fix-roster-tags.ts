/**
 * Add angmar-og tag to members from the roster CSV
 * and merge duplicates with ang prefix
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const dryRun = process.argv.includes('--dry-run');

// Read roster CSV to get the member names
const csvPath = path.join(__dirname, '../data/ang_roster_20260123.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvNames = new Set<string>();

const lines = csvContent.trim().split('\n');
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = line.split(',');
  if (parts.length >= 1) {
    csvNames.add(parts[0].trim());
  }
}

console.log(`CSV has ${csvNames.size} members`);

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .replace(/^ang\s*/i, '')
    .replace(/^ᵃⁿᵍ\s*/i, '')
    .toLowerCase()
    .trim();
}

async function main() {
  console.log(dryRun ? 'DRY RUN - no changes will be made\n' : '');

  // Get all active members
  const { data: allMembers } = await supabase
    .from('alliance_roster')
    .select('id, name, tags, power, kills, t4_kills, t5_kills, honor_points')
    .eq('is_active', true);

  console.log(`Active members: ${allMembers?.length}`);

  // Group by normalized name to find duplicates
  const byNormalized = new Map<string, typeof allMembers>();
  for (const m of allMembers || []) {
    const norm = normalizeName(m.name);
    const existing = byNormalized.get(norm) || [];
    existing.push(m);
    byNormalized.set(norm, existing);
  }

  // Find duplicates (members with same normalized name)
  const duplicates = [...byNormalized.entries()].filter(([_, members]) => members && members.length > 1);
  console.log(`\nDuplicates found: ${duplicates.length}`);

  if (duplicates.length > 0) {
    console.log('\nDuplicate groups (first 10):');
    duplicates.slice(0, 10).forEach(([norm, members]) => {
      console.log(`  "${norm}":`);
      members?.forEach(m => console.log(`    - ${m.name} (tags: ${m.tags?.join(', ') || 'none'}, power: ${m.power})`));
    });
  }

  // Strategy:
  // 1. For duplicates: keep the tagged one, deactivate the untagged duplicate
  // 2. For non-duplicates in CSV without tags: add the angmar-og tag

  // First, handle duplicates - keep tagged one, deactivate untagged
  const toDeactivate: { id: string; name: string }[] = [];
  const toUpdatePower: { id: string; name: string; newPower: number }[] = [];

  for (const [norm, members] of duplicates) {
    if (!members) continue;
    // Find tagged and untagged
    const tagged = members.find(m => m.tags?.includes('angmar-og'));
    const untagged = members.filter(m => !m.tags?.includes('angmar-og'));

    if (tagged && untagged.length > 0) {
      // Deactivate untagged duplicates
      for (const m of untagged) {
        toDeactivate.push({ id: m.id, name: m.name });
        // If untagged has higher power, update tagged member's power
        if (m.power > tagged.power) {
          toUpdatePower.push({ id: tagged.id, name: tagged.name, newPower: m.power });
        }
      }
    }
  }

  console.log(`\nDuplicates to deactivate: ${toDeactivate.length}`);
  if (toDeactivate.length > 0) {
    console.log('Sample:');
    toDeactivate.slice(0, 10).forEach(m => console.log(`  - ${m.name}`));
  }

  // Find non-duplicate CSV members that need tags
  const toTag: { id: string; name: string; currentTags: string[] }[] = [];

  for (const csvName of csvNames) {
    const norm = normalizeName(csvName);
    const members = byNormalized.get(norm);

    // Only tag if NOT a duplicate (single member) and doesn't have tag
    if (members && members.length === 1) {
      const m = members[0];
      if (!m.tags || !m.tags.includes('angmar-og')) {
        toTag.push({ id: m.id, name: m.name, currentTags: m.tags || [] });
      }
    }
  }

  console.log(`\nNon-duplicate members to add angmar-og tag: ${toTag.length}`);
  if (toTag.length > 0) {
    console.log('Sample:');
    toTag.slice(0, 10).forEach(m => console.log(`  - ${m.name}`));
  }

  if (dryRun) {
    console.log('\nDRY RUN - no changes made');
    return;
  }

  // Deactivate duplicates
  let deactivated = 0;
  for (const m of toDeactivate) {
    const { error } = await supabase
      .from('alliance_roster')
      .update({ is_active: false })
      .eq('id', m.id);

    if (!error) deactivated++;
  }
  console.log(`\nDeactivated ${deactivated} duplicate members`);

  // Update power for tagged members where untagged had higher power
  let powerUpdated = 0;
  for (const m of toUpdatePower) {
    const { error } = await supabase
      .from('alliance_roster')
      .update({ power: m.newPower })
      .eq('id', m.id);

    if (!error) powerUpdated++;
  }
  console.log(`Updated power for ${powerUpdated} members`);

  // Add tags to non-duplicates
  let tagged = 0;
  for (const m of toTag) {
    const newTags = [...m.currentTags, 'angmar-og'];
    const { error } = await supabase
      .from('alliance_roster')
      .update({ tags: newTags })
      .eq('id', m.id);

    if (!error) tagged++;
  }
  console.log(`Added angmar-og tag to ${tagged} members`);

  console.log('\nDone!');
}

main().catch(console.error);
