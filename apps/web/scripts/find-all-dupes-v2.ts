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

async function findAllDupes() {
  const { data: roster, error } = await supabase
    .from('alliance_roster')
    .select('id, name, is_active, merged_into, power, kills')
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

  console.log(`Found ${duplicates.length} duplicate groups:\n`);

  for (const [key, members] of duplicates) {
    console.log(`"${key}" (${members.length} entries):`);
    for (const m of members) {
      console.log(`  - "${m.name}" | Power: ${(m.power/1000000).toFixed(1)}M | KP: ${((m.kills||0)/1000000).toFixed(1)}M | ID: ${m.id}`);
    }
    console.log('');
  }

  return duplicates;
}

findAllDupes();
