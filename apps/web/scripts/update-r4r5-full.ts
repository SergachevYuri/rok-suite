/**
 * Comprehensive R4/R5 roster update from in-game screenshots (Feb 16, 2026).
 *
 * 1. Resets all current R4/R5 roles not in the expected list
 * 2. For each expected R4/R5, finds by governor_id (primary) or name (fallback)
 * 3. Sets role + alliance
 * 4. Inserts new members not yet in the roster
 * 5. Reports summary
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
);

interface Expected {
  governor_id?: number;  // primary match key
  name: string;          // fallback match / display name for new inserts
  role: 'R4' | 'R5';
  alliance: string;      // sorter display tag
}

// Full R4/R5 roster — Feb 16 2026 update
// governor_ids from kingdom stats export + DB cross-reference
const EXPECTED: Expected[] = [
  // ANG
  { governor_id: 210387545, name: 'No Migration', role: 'R5', alliance: 'ANG' },
  { governor_id: 210397851, name: 'Suntzu', role: 'R4', alliance: 'ANG' },
  { governor_id: 209848954, name: 'Fluffy Queen', role: 'R4', alliance: 'ANG' },
  { governor_id: 210002710, name: 'Michael x 23', role: 'R4', alliance: 'ANG' },
  { governor_id: 210742295, name: 'Funny', role: 'R4', alliance: 'ANG' },
  { governor_id: 210400254, name: 'BBQSGE', role: 'R4', alliance: 'ANG' },
  { governor_id: 209605052, name: 'Vael', role: 'R4', alliance: 'ANG' },
  { governor_id: 210423049, name: 'Cain', role: 'R4', alliance: 'ANG' },

  // MNG (in-game 23KK)
  { governor_id: 209673553, name: 'King Mithra', role: 'R5', alliance: 'MNG' },
  { governor_id: 209664900, name: 'KkDaddyLizz', role: 'R4', alliance: 'MNG' },
  { governor_id: 209759877, name: 'SirFaust', role: 'R4', alliance: 'MNG' },
  { governor_id: 209749530, name: 'Tom Lazy', role: 'R4', alliance: 'MNG' },
  { governor_id: 209749783, name: 'Shiba x 23', role: 'R4', alliance: 'MNG' },
  { governor_id: 209750614, name: 'Cleo x 23', role: 'R4', alliance: 'MNG' },

  // KNG
  { governor_id: 210198531, name: 'SAINT', role: 'R5', alliance: 'KNG' },
  { governor_id: 210523172, name: 'Chaos Knight', role: 'R4', alliance: 'KNG' },
  { governor_id: 210400735, name: 'Classic071', role: 'R4', alliance: 'KNG' },
  { governor_id: 209854059, name: 'Donjon 3917', role: 'R4', alliance: 'KNG' },
  { governor_id: 210512736, name: 'GOLIAS', role: 'R4', alliance: 'KNG' },
  { governor_id: 210237494, name: 'MEDUZA', role: 'R4', alliance: 'KNG' }, // was KkWarMedusa in MNG
  { governor_id: 209410036, name: 'SurpriseBox', role: 'R4', alliance: 'KNG' },
  { governor_id: 209880761, name: 'Fighter', role: 'R4', alliance: 'KNG' },

  // ENG (in-game EQ)
  { governor_id: 210382546, name: 'Larsius IV', role: 'R5', alliance: 'ENG' },
  { governor_id: 209740288, name: 'YaSiiiNAvKaaN06', role: 'R4', alliance: 'ENG' },
  { governor_id: 209745089, name: 'LeuZe', role: 'R4', alliance: 'ENG' },
  { governor_id: 210391920, name: 'engDanjc', role: 'R4', alliance: 'ENG' },
  { governor_id: 210084771, name: 'Bshusttt', role: 'R4', alliance: 'ENG' },
  { governor_id: 210302298, name: 'Makym', role: 'R4', alliance: 'ENG' },
  { governor_id: 210398945, name: 'BeGod', role: 'R4', alliance: 'ENG' },
  { governor_id: 209714378, name: 'PASA09', role: 'R4', alliance: 'ENG' },

  // 23A (in-game 23-A)
  { governor_id: 210294416, name: 'GABBRO', role: 'R5', alliance: '23A' },
  { governor_id: 210386613, name: 'Chriss33', role: 'R4', alliance: '23A' },
  { governor_id: 209837387, name: 'DR Rajah117', role: 'R4', alliance: '23A' },
  { governor_id: 210354476, name: 'Tobin6969', role: 'R4', alliance: '23A' },
  { governor_id: 210323383, name: 'KsSasha', role: 'R4', alliance: '23A' },
  { governor_id: 210446468, name: 'Zelsii', role: 'R4', alliance: '23A' },
  { governor_id: 210140641, name: 'LittleShibaa', role: 'R4', alliance: '23A' },

  // SNG (in-game K23S)
  { governor_id: 210342539, name: 'SlavaSlava', role: 'R5', alliance: 'SNG' },
  { governor_id: 209636800, name: 'SkyLord', role: 'R4', alliance: 'SNG' },
  { governor_id: 210331194, name: 'Isko 123', role: 'R4', alliance: 'SNG' },
  { governor_id: 210326713, name: 'SkyNemor', role: 'R4', alliance: 'SNG' },
  { governor_id: 210347793, name: 'natalya777', role: 'R4', alliance: 'SNG' },
  { governor_id: 210112027, name: 'Vaelwyn', role: 'R4', alliance: 'SNG' },

  // 23SP
  { governor_id: 210361741, name: 'STRikeR', role: 'R5', alliance: '23SP' },
  { governor_id: 210296479, name: 'nanase', role: 'R4', alliance: '23SP' },
  { governor_id: 210339647, name: 'Scacco A', role: 'R4', alliance: '23SP' },
  { governor_id: 210307135, name: 'WTheF1', role: 'R4', alliance: '23SP' },
  { governor_id: 210307855, name: 'Ayyildiz', role: 'R4', alliance: '23SP' },
  { governor_id: 210350938, name: 'channao', role: 'R4', alliance: '23SP' },
  { governor_id: 210361210, name: 'Smithsoniam', role: 'R4', alliance: '23SP' },
  { governor_id: 210318244, name: 'Adrenaline', role: 'R4', alliance: '23SP' },
  { governor_id: 210306823, name: 'Bulat 46', role: 'R4', alliance: '23SP' },

  // GNG
  { governor_id: 210108666, name: 'YunoOne', role: 'R5', alliance: 'GNG' },
  { governor_id: 210369157, name: 'huewa11', role: 'R4', alliance: 'GNG' },
  { governor_id: 210920466, name: 'SOUTH', role: 'R4', alliance: 'GNG' },
  { governor_id: 209866523, name: 'Lucas', role: 'R4', alliance: 'GNG' },
  { governor_id: 210420734, name: 'angYuno', role: 'R4', alliance: 'GNG' },
  { governor_id: 210243670, name: 'live akmen', role: 'R4', alliance: 'GNG' },
  { governor_id: 213785417, name: 'TvnTequila', role: 'R4', alliance: 'GNG' },
  { governor_id: 215689744, name: 'TequilaF1', role: 'R4', alliance: 'GNG' },
];

async function main() {
  // 1. Fetch all active roster members
  const { data: all, error: fetchErr } = await sb
    .from('alliance_roster')
    .select('id, name, role, alliance, governor_id, is_active')
    .eq('is_active', true);

  if (fetchErr || !all) {
    console.error('Fetch error:', fetchErr);
    process.exit(1);
  }

  console.log(`Fetched ${all.length} active roster members\n`);

  // Build lookups
  const byGovId = new Map<number, typeof all[0]>();
  const byNameLower = new Map<string, typeof all[0]>();
  for (const r of all) {
    if (r.governor_id) byGovId.set(Number(r.governor_id), r);
    byNameLower.set(r.name.toLowerCase(), r);
  }

  // 2. Build set of expected governor_ids for quick lookup
  const expectedGovIds = new Set(EXPECTED.filter(e => e.governor_id).map(e => e.governor_id));

  // 3. Reset all current R4/R5 that are NOT in the expected list
  const currentR4R5 = all.filter(r => r.role === 'R4' || r.role === 'R5');
  let resetCount = 0;
  for (const r of currentR4R5) {
    const govId = r.governor_id ? Number(r.governor_id) : null;
    if (govId && expectedGovIds.has(govId)) continue; // keep — in expected list
    // Also check name fallback for entries without governor_id
    if (!govId) {
      const nameMatch = EXPECTED.some(e => e.name.toLowerCase() === r.name.toLowerCase());
      if (nameMatch) continue;
    }
    console.log(`  Reset: ${r.name} (was ${r.role} in ${r.alliance}, gov_id: ${r.governor_id || 'none'})`);
    const { error } = await sb
      .from('alliance_roster')
      .update({ role: null })
      .eq('id', r.id);
    if (error) console.error(`    ERROR: ${error.message}`);
    else resetCount++;
  }
  console.log(`\nReset ${resetCount} old R4/R5 entries\n`);

  // 4. Set R4/R5 for expected members
  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const exp of EXPECTED) {
    // Match by governor_id first, then name fallback
    let match = exp.governor_id ? byGovId.get(exp.governor_id) : undefined;
    if (!match) {
      match = byNameLower.get(exp.name.toLowerCase());
    }

    if (match) {
      const updates: Record<string, unknown> = {
        role: exp.role,
        alliance: exp.alliance,
      };

      const changes: string[] = [];
      if (match.role !== exp.role) changes.push(`role: ${match.role || 'null'} → ${exp.role}`);
      if (match.alliance !== exp.alliance) changes.push(`alliance: ${match.alliance} → ${exp.alliance}`);

      const { error } = await sb
        .from('alliance_roster')
        .update(updates)
        .eq('id', match.id);

      if (error) {
        console.error(`  ERROR updating ${exp.name}: ${error.message}`);
        skipped++;
      } else {
        const dbName = match.name !== exp.name ? ` [DB: ${match.name}]` : '';
        console.log(`  ✓ ${exp.name}${dbName} (${exp.role}, ${exp.alliance})${changes.length ? ' — ' + changes.join(', ') : ''}`);
        updated++;
      }
    } else {
      // Insert new entry
      const { error } = await sb
        .from('alliance_roster')
        .insert({
          name: exp.name,
          role: exp.role,
          alliance: exp.alliance,
          governor_id: exp.governor_id || null,
          is_active: true,
          power: 0,
          kills: 0,
          deads: 0,
        });

      if (error) {
        console.error(`  ERROR inserting ${exp.name}: ${error.message}`);
        skipped++;
      } else {
        console.log(`  + NEW: ${exp.name} (${exp.role}, ${exp.alliance}, gov_id: ${exp.governor_id || 'none'})`);
        inserted++;
      }
    }
  }

  console.log(`\nDone: ${updated} updated, ${inserted} inserted, ${skipped} skipped`);

  // 5. Final summary
  const { data: final } = await sb
    .from('alliance_roster')
    .select('name, governor_id, role, alliance')
    .eq('is_active', true)
    .in('role', ['R4', 'R5'])
    .order('alliance')
    .order('role', { ascending: false });

  let currentAlliance = '';
  let count = 0;
  console.log('\n--- Final R4/R5 roster ---');
  for (const r of final || []) {
    if (r.alliance !== currentAlliance) {
      currentAlliance = r.alliance!;
      console.log(`\n${currentAlliance}:`);
    }
    console.log(`  ${r.role}  ${r.name}  (${r.governor_id || 'no id'})`);
    count++;
  }
  console.log(`\nTotal: ${count}`);
}

main();
