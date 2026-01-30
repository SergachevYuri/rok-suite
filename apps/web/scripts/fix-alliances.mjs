import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const APPLY = process.argv.includes('--apply');

const assignments = [
  // ANG — prefix members
  { name: 'ᵃⁿᵍFRODO', alliance: 'ANG' },
  { name: 'angTomb', alliance: 'ANG' },
  { name: 'ᵃⁿᵍXtelli', alliance: 'ANG' },
  { name: 'angSunman', alliance: 'ANG' },
  { name: 'ang STEPHENлж', alliance: 'ANG' },
  { name: 'ᵃⁿᵍConejo', alliance: 'ANG' },
  { name: 'ᵃⁿᵍAL0NE', alliance: 'ANG' },
  { name: 'ᵃⁿᵍWOLF', alliance: 'ANG' },
  { name: 'ᵃⁿᵍBori', alliance: 'ANG' },
  // ANG — user-identified
  { name: 'Aw Kozak', alliance: 'ANG' },
  { name: 'LOLI', alliance: 'ANG' },
  { name: 'The Witch Queen', alliance: 'ANG' },
  { name: 'ʳᵘSkyLord', alliance: 'ANG' },
  { name: 'Black Ruler', alliance: 'ANG' },
  { name: 'ˢᴸGouverneur', alliance: 'ANG' },
  { name: 'ᵛⁿkenji', alliance: 'ANG' },
  { name: 'VN kenji', alliance: 'ANG' },
  { name: 'ᴸᴹGiuliaFC', alliance: 'ANG' },
  { name: 'ᴬlegioneSPQR', alliance: 'ANG' },
  { name: 'EF SàuVôLệ', alliance: 'ANG' },
  { name: 'ShadowLunar', alliance: 'ANG' },
  { name: 'KouSmiNaS', alliance: 'ANG' },
  { name: 'ᴸᴴ sachie', alliance: 'ANG' },
  { name: 'Djembo', alliance: 'ANG' },
  { name: 'モニタリング', alliance: 'ANG' },
  { name: 'Alak D', alliance: 'ANG' },
  { name: 'CAPITAN', alliance: 'ANG' },
  { name: 'ksa 511', alliance: 'ANG' },
  { name: 'HoangRed', alliance: 'ANG' },
  // 23KK — prefix members
  { name: 'ᴷᴷNicohZen', alliance: '23KK' },
  { name: 'ᴷᴷ Mưa\'♪', alliance: '23KK' },
  { name: 'ᴷᴷDaxzXxz', alliance: '23KK' },
  { name: 'ᴷᴷHàUyễn', alliance: '23KK' },
  { name: 'ᴷᴷJilsssss', alliance: '23KK' },
  { name: 'ᵏᵏBrex', alliance: '23KK' },
  { name: '✖KKREİJACK', alliance: '23KK' },
  // 23KK — user-identified
  { name: 'Aw BuLu', alliance: '23KK' },
  { name: 'AvBlizt', alliance: '23KK' },
  { name: 'ᴬᶜmonkey d', alliance: '23KK' },
  { name: 'PhɐRɐøh', alliance: '23KK' },
  { name: 'ᶦˢbones', alliance: '23KK' },
  { name: 'Fizryk3', alliance: '23KK' },
  { name: 'GHOST', alliance: '23KK' },
  { name: '乂Mihawk乂', alliance: '23KK' },
  // KNG
  { name: 'DR Rajah117', alliance: 'KNG' },
  { name: 'KNGJinwoo', alliance: 'KNG' },
  { name: 'Smoking420', alliance: 'KNG' },
  { name: 'Apollo ⊘', alliance: 'KNG' },
  // K23S
  { name: 'KOMMERS', alliance: 'K23S' },
];

// Group by alliance for display
const byAlliance = {};
for (const a of assignments) {
  if (!byAlliance[a.alliance]) byAlliance[a.alliance] = [];
  byAlliance[a.alliance].push(a.name);
}

console.log('Alliance assignments to apply:\n');
for (const [alliance, names] of Object.entries(byAlliance).sort()) {
  console.log(`  ${alliance}: ${names.length} members`);
  for (const n of names) console.log(`    - ${n}`);
}

console.log(`\nUnassigned (no alliance provided): Scacco A, ADOLF SAMI, AcDeputatovaDi, Dante`);
console.log(`\nTotal: ${assignments.length} members to update\n`);

if (!APPLY) {
  console.log('Run with --apply to update the database');
  process.exit(0);
}

console.log('=== APPLYING ===\n');

let updated = 0;
let failed = 0;
for (const { name, alliance } of assignments) {
  const { error } = await sb.from('alliance_roster').update({ alliance }).eq('name', name);
  if (error) {
    console.log(`  FAIL: ${name} → ${alliance}: ${error.message}`);
    failed++;
  } else {
    console.log(`  OK: ${name} → ${alliance}`);
    updated++;
  }
}

console.log(`\nDone: ${updated} updated, ${failed} failed`);
