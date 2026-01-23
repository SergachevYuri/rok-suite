import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Same normalization as cleanup script
function normalizeName(name: string): string {
  let normalized = name
    .replace(/^\['ANG\]\s*/i, '')
    .replace(/^\[ANG\]\s*/i, '')
    .replace(/^\[EQng\]\s*/i, '')
    .replace(/^ᵃⁿᵍ/i, '')
    .replace(/^ᴬⁿᵍ/i, '')
    .replace(/^ᵏᵏ/i, '')
    .replace(/^ᴷᴷ/i, '')
    .replace(/^кк/i, '')
    .replace(/^ᴬᶜ/i, '')
    .replace(/^ᴬʷ/i, '')
    .replace(/^ᴬᴺᴳ/i, '')
    .replace(/^ᴬ\s*/i, '')
    .replace(/^ᴸᴹ/i, '')
    .replace(/^ˢᴸ/i, '')
    .replace(/^ᴿᵁ/i, '')
    .replace(/^ᵛᵒ/i, '')
    .replace(/^ᵛᶰ/i, '')
    .replace(/^ᴵᴸ/i, '')
    .replace(/^ᶦˢ/i, '')
    .replace(/^ᴮᴿ/i, '')
    .replace(/^ᴮᴳ/i, '')
    .replace(/^ᴰᴸ/i, '')
    .replace(/^ᴳᴸ/i, '')
    .replace(/^ᴴ乂/i, '')
    .replace(/^ᴷᴺᴳ/i, '')
    .replace(/^ᴰᴿ/i, '')
    .replace(/^ᴾᵀᵠ/i, '')
    .replace(/^ang\s*/i, '')
    .replace(/^KK\s*/i, '')
    .replace(/^LM\s*/i, '')
    .replace(/^sL/i, '')
    .replace(/^GL\s*/i, '')
    .replace(/^RU\s*/i, '')
    .replace(/^VN\s*/i, '')
    .replace(/^EF\s*/i, '')
    .replace(/^DR\s*/i, '')
    .replace(/^AV✖/i, '')
    .replace(/^Aw\s*/i, '')
    .replace(/^CZA/i, '')
    .replace(/^PTQ\s*/i, '')
    .replace(/^BINH\s*/i, '')
    .trim();

  normalized = normalized
    .replace(/✖/g, '')
    .replace(/乄/g, '')
    .replace(/⚔/g, '')
    .replace(/≠/g, '')
    .replace(/ψ/g, '')
    .replace(/メ/g, '')
    .replace(/㋡/g, '')
    .replace(/ツ/g, '')
    .replace(/々/g, '')
    .replace(/亗/g, '')
    .trim();

  return normalized;
}

async function check() {
  const { data } = await supabase
    .from('alliance_roster')
    .select('name, power, is_active')
    .order('power', { ascending: false });

  // Build map of active members by normalized name
  const activeByNormalized = new Map<string, { name: string; power: number }[]>();
  const inactiveByNormalized = new Map<string, { name: string; power: number }[]>();

  for (const m of data || []) {
    const key = normalizeName(m.name).toLowerCase();
    const map = m.is_active ? activeByNormalized : inactiveByNormalized;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push({ name: m.name, power: m.power });
  }

  // Check for inactive members that would duplicate active ᵃⁿᵍ members
  console.log('Inactive members that would duplicate active ᵃⁿᵍ members:');
  let count = 0;
  for (const [key, inactiveMembers] of inactiveByNormalized) {
    const activeMembers = activeByNormalized.get(key);
    if (activeMembers) {
      // Check if any active member has ᵃⁿᵍ prefix
      const hasAngActive = activeMembers.some(m => m.name.startsWith('ᵃⁿᵍ') || m.name.toLowerCase().startsWith('ang'));
      if (hasAngActive && inactiveMembers.length > 0) {
        count++;
        console.log(`  "${key}":`);
        console.log(`    Active:`);
        activeMembers.forEach(m => console.log(`      ✓ ${m.name} (${(m.power/1000000).toFixed(1)}M)`));
        console.log(`    Would activate:`);
        inactiveMembers.forEach(m => console.log(`      ✗ ${m.name} (${(m.power/1000000).toFixed(1)}M)`));
      }
    }
  }
  console.log(`\nTotal conflicts: ${count}`);
}

check();
