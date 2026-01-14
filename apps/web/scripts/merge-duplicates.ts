/**
 * Merge duplicate roster entries (soft merge - keeps records)
 *
 * Instead of deleting duplicates, this script:
 * 1. Merges stats into the primary record (decorated name)
 * 2. Adds alternate names to the primary's alternate_names array
 * 3. Marks duplicates as inactive with merged_into reference
 *
 * Usage:
 *   npx tsx apps/web/scripts/merge-duplicates.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DRY_RUN = process.argv.includes('--dry-run');

// Common prefixes/suffixes used in ROK names
const CLAN_TAGS = ['ᵃⁿᵍ', 'ᵏᵏ', 'кк', 'К҉к҉', 'K҉k҉', '๛', 'ᴬᶜ', '҉', 'ккк', 'ᵏᵏᵏ'];

function stripTags(name: string): string {
  let clean = name;
  for (const tag of CLAN_TAGS) {
    clean = clean.replaceAll(tag, '');
  }
  clean = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return clean.trim().toLowerCase();
}

function hasTag(name: string): boolean {
  return CLAN_TAGS.some(tag => name.includes(tag));
}

interface RosterMember {
  id: string;
  name: string;
  power: number;
  kills: number;
  t4_kills: number;
  t5_kills: number;
  deads: number;
  honor_points: number;
  tier: string | null;
  role: string | null;
  notes: string | null;
  tags: string[] | null;
  alternate_names: string[] | null;
  merged_into: string | null;
  is_active: boolean;
  governor_id: number | null;
  troops_healed: number;
  acclaim: number;
  kvk_points: number;
  highest_power: number;
  created_at: string;
}

async function mergeDuplicates() {
  const { data: roster, error } = await supabase
    .from('alliance_roster')
    .select('*')
    .is('merged_into', null) // Only get non-merged records
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Group by stripped name
  const groups = new Map<string, RosterMember[]>();

  for (const member of roster!) {
    const key = stripTags(member.name);
    if (!key || key.length < 2) continue;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(member as RosterMember);
  }

  // Find groups with multiple entries
  const duplicates = Array.from(groups.entries())
    .filter(([_, members]) => members.length > 1);

  console.log(`Found ${duplicates.length} duplicate groups to merge`);
  if (DRY_RUN) console.log('DRY RUN - no changes will be made\n');

  let mergeCount = 0;

  for (const [key, members] of duplicates) {
    // Prefer the entry with clan tag, otherwise the one with more data
    const tagged = members.filter(m => hasTag(m.name));
    const untagged = members.filter(m => !hasTag(m.name));

    let primary: RosterMember;
    let toMerge: RosterMember[];

    if (tagged.length > 0) {
      // Keep the tagged one, merge from untagged
      primary = tagged[0];
      toMerge = [...tagged.slice(1), ...untagged];
    } else {
      // No tagged entries, keep the one with highest power
      members.sort((a, b) => b.power - a.power);
      primary = members[0];
      toMerge = members.slice(1);
    }

    // Collect all alternate names (including any existing ones)
    const allAlternateNames = new Set<string>(primary.alternate_names || []);
    for (const m of toMerge) {
      allAlternateNames.add(m.name);
      if (m.alternate_names) {
        m.alternate_names.forEach(n => allAlternateNames.add(n));
      }
    }

    // Merge stats: take max of numeric fields, concatenate notes, merge tags
    const merged = {
      power: Math.max(primary.power, ...toMerge.map(m => m.power || 0)),
      kills: Math.max(primary.kills || 0, ...toMerge.map(m => m.kills || 0)),
      t4_kills: Math.max(primary.t4_kills || 0, ...toMerge.map(m => m.t4_kills || 0)),
      t5_kills: Math.max(primary.t5_kills || 0, ...toMerge.map(m => m.t5_kills || 0)),
      deads: Math.max(primary.deads || 0, ...toMerge.map(m => m.deads || 0)),
      honor_points: Math.max(primary.honor_points || 0, ...toMerge.map(m => m.honor_points || 0)),
      troops_healed: Math.max(primary.troops_healed || 0, ...toMerge.map(m => m.troops_healed || 0)),
      acclaim: Math.max(primary.acclaim || 0, ...toMerge.map(m => m.acclaim || 0)),
      kvk_points: Math.max(primary.kvk_points || 0, ...toMerge.map(m => m.kvk_points || 0)),
      highest_power: Math.max(primary.highest_power || 0, ...toMerge.map(m => m.highest_power || 0)),
      // Take role from original if primary doesn't have one
      role: primary.role || toMerge.find(m => m.role)?.role || null,
      // Take tier from original if primary doesn't have one
      tier: primary.tier || toMerge.find(m => m.tier)?.tier || null,
      // Merge tags
      tags: Array.from(new Set([
        ...(primary.tags || []),
        ...toMerge.flatMap(m => m.tags || [])
      ])).filter(Boolean),
      // Concatenate notes (avoiding duplicates)
      notes: Array.from(new Set([primary.notes, ...toMerge.map(m => m.notes)].filter(Boolean))).join(' | ') || null,
      // Take governor_id from ROKstats entry (usually the tagged one)
      governor_id: primary.governor_id || toMerge.find(m => m.governor_id)?.governor_id || null,
      // Store all alternate names
      alternate_names: Array.from(allAlternateNames),
    };

    console.log(`\nMerging "${key}":`);
    console.log(`  Primary: "${primary.name}" (ID: ${primary.id})`);
    console.log(`  Alternate names: ${Array.from(allAlternateNames).join(', ')}`);
    for (const m of toMerge) {
      console.log(`  Merge from: "${m.name}" (ID: ${m.id}) -> will mark inactive`);
    }
    console.log(`  Merged power: ${(merged.power/1000000).toFixed(1)}M, KP: ${(merged.kills/1000000).toFixed(1)}M`);

    if (!DRY_RUN) {
      // Update primary with merged data
      const { error: updateError } = await supabase
        .from('alliance_roster')
        .update(merged)
        .eq('id', primary.id);

      if (updateError) {
        console.error(`  ERROR updating primary: ${updateError.message}`);
        continue;
      }

      // Mark duplicates as inactive and link to primary
      for (const m of toMerge) {
        const { error: mergeError } = await supabase
          .from('alliance_roster')
          .update({
            is_active: false,
            merged_into: primary.id,
          })
          .eq('id', m.id);

        if (mergeError) {
          console.error(`  ERROR marking ${m.name} as merged: ${mergeError.message}`);
        }
      }

      mergeCount++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${DRY_RUN ? 'Would merge' : 'Merged'} ${duplicates.length} groups`);
  console.log(`Duplicates are marked inactive with merged_into reference (not deleted)`);
  console.log(`Primary records now have alternate_names array for tracking`);
}

mergeDuplicates();
