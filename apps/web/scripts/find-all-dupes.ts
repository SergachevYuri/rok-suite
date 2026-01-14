import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CLAN_TAGS = ['ᵃⁿᵍ', 'ᵏᵏ', 'кк', 'К҉к҉', 'K҉k҉', '๛', 'ᴬᶜ', '҉', 'ккк', 'ᵏᵏᵏ'];

function stripTags(name: string): string {
  let clean = name;
  for (const tag of CLAN_TAGS) {
    clean = clean.replaceAll(tag, '');
  }
  clean = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return clean.trim().toLowerCase();
}

async function findAllDupes() {
  // Get ALL records (including already merged ones)
  const { data: roster, error } = await supabase
    .from('alliance_roster')
    .select('id, name, is_active, merged_into, power, kills')
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

  // Find groups with multiple ACTIVE entries
  const activeGroups = Array.from(groups.entries())
    .map(([key, members]) => {
      const activeMembers = members.filter(m => m.is_active && !m.merged_into);
      return [key, activeMembers, members] as const;
    })
    .filter(([_, activeMembers]) => activeMembers.length > 1);

  console.log(`Found ${activeGroups.length} groups with multiple ACTIVE entries:\n`);

  for (const [key, activeMembers, allMembers] of activeGroups.slice(0, 20)) {
    console.log(`"${key}" (${activeMembers.length} active):`);
    for (const m of allMembers) {
      const status = m.is_active ? 'ACTIVE' : 'inactive';
      const merged = m.merged_into ? `merged->` : '';
      console.log(`  - "${m.name}" | ${status} ${merged} | Power: ${(m.power/1000000).toFixed(1)}M | KP: ${((m.kills||0)/1000000).toFixed(1)}M`);
    }
    console.log('');
  }
}

findAllDupes();
