/**
 * Find duplicate roster entries based on stripped names
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx tsx apps/web/scripts/find-duplicates.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Common prefixes/suffixes used in ROK names
const CLAN_TAGS = ['ᵃⁿᵍ', 'ᵏᵏ', 'кк', 'К҉к҉', 'K҉k҉', '๛', 'ᴬᶜ', '҉', 'ккк', 'ᵏᵏᵏ'];

function stripTags(name: string): string {
  let clean = name;
  for (const tag of CLAN_TAGS) {
    clean = clean.replaceAll(tag, '');
  }
  // Remove common unicode decorations but keep alphanumeric and spaces
  clean = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return clean.trim().toLowerCase();
}

async function findDuplicates() {
  const { data: roster, error } = await supabase
    .from('alliance_roster')
    .select('id, name, power, kills, is_active, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

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

  console.log(`Found ${duplicates.length} potential duplicate groups:\n`);

  for (const [key, members] of duplicates.slice(0, 50)) {
    console.log(`"${key}" (${members.length} entries):`);
    for (const m of members) {
      const powerM = (m.power / 1000000).toFixed(1);
      const kpM = ((m.kills || 0) / 1000000).toFixed(1);
      console.log(`  - "${m.name}" | Power: ${powerM}M | KP: ${kpM}M | Active: ${m.is_active}`);
    }
    console.log('');
  }

  return duplicates;
}

findDuplicates();
