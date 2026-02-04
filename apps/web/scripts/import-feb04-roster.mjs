import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const APPLY = process.argv.includes('--apply');
const SNAPSHOT_DATE = '2026-02-04';

// --- Alliance name mapping (CSV → DB) ---
const allianceMap = {
  'MadFluffy': 'ANG',
  '23KK': '23KK',
  'KNG': 'KNG',
};

// --- Helpers ---

function parseNum(s) {
  if (!s || s.trim() === '') return null;
  const val = Number(String(s).replace(/,/g, '').replace(/"/g, ''));
  return isNaN(val) ? null : val;
}

function aggressiveNorm(name) {
  return name.toLowerCase()
    .replace(/^(ᵃⁿᵍ|ang|ᴬ |ᴸᴹ|ᴳᴸ|ᴷᴷ |ᴷᴷ|ᴿᵁ|ᴬᵂ |ᴬˣ|ᴰᴿ |ᴰᴿ|ᴬᶜ|ᵛⁿ |ᵛⁿ|ᴵˢ|ᴵᴸ|ˢʷ|кк|ᵏᵏ|k҉k҉|ʞʞ|xᴷᴷ|ᴮᴿ|kk |kk|br|dr |sw)\s*/i, '')
    .replace(/[\u0300-\u036f\u0489\u0338\u20DE\u20DF]/g, '')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/[ᴬᴷᴺᴿᵁᵂˣᴸᴹᴳᴵˢᴰᶜᵛⁿᵏᵍᵃᵇ]/g, '')
    .replace(/[ツ⊘⑦★⚝✖]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Parse CSV ---
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const header = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    header.forEach((col, i) => { row[col.trim()] = (values[i] || '').trim(); });
    return row;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// --- Main ---
const csv = readFileSync('data/ang-23kk-kng_honor_points_mob_20260204.csv', 'utf8');
const rows = parseCSV(csv);
console.log(`CSV: ${rows.length} rows\n`);

// Parse CSV rows
const csvMembers = rows.map(r => ({
  name: r.Name?.trim(),
  power: parseNum(r.Power),
  rank: r.Rank?.trim(),
  alliance: allianceMap[r.Alliance?.trim()] || r.Alliance?.trim() || null,
  allianceRaw: r.Alliance?.trim() || null,
  mobilization_rank: parseNum(r.Mobilization_Rank),
  mobilization_points: parseNum(r.Mobilization_Points),
  turned_in: parseNum(r.Turned_In),
  accepted: parseNum(r.Accepted),
  honor_rank: parseNum(r.Honor_Rank),
  honor_points: parseNum(r.Honor_Points),
})).filter(m => m.name);

console.log(`Parsed: ${csvMembers.length} members (ANG: ${csvMembers.filter(m=>m.alliance==='ANG').length}, 23KK: ${csvMembers.filter(m=>m.alliance==='23KK').length}, KNG: ${csvMembers.filter(m=>m.alliance==='KNG').length})\n`);

// Fetch all roster members (active + inactive)
let allRoster = [];
let from = 0;
while (true) {
  const { data } = await sb.from('alliance_roster')
    .select('id, name, power, kills, t4_kills, t5_kills, honor_points, deads, role, alliance, is_active, alternate_names')
    .range(from, from + 999);
  if (!data || data.length === 0) break;
  allRoster = allRoster.concat(data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`DB roster: ${allRoster.length} entries (active: ${allRoster.filter(m=>m.is_active).length}, inactive: ${allRoster.filter(m=>!m.is_active).length})\n`);

// Build lookup maps
const byExact = new Map();
const byAlt = new Map();
const byNorm = new Map();
const normCollisions = new Set();

for (const m of allRoster) {
  byExact.set(m.name, m);

  if (m.alternate_names) {
    for (const alt of m.alternate_names) {
      byAlt.set(alt, m);
    }
  }

  const norm = aggressiveNorm(m.name);
  if (norm) {
    const existing = byNorm.get(norm);
    if (existing && existing.id !== m.id) {
      if (m.is_active && !existing.is_active) {
        byNorm.set(norm, m);
      }
      if (m.is_active && existing.is_active) {
        normCollisions.add(norm);
      }
    } else if (!existing) {
      byNorm.set(norm, m);
    }
  }

  if (m.alternate_names) {
    for (const alt of m.alternate_names) {
      const altNorm = aggressiveNorm(alt);
      if (altNorm && !byNorm.has(altNorm)) {
        byNorm.set(altNorm, m);
      }
    }
  }
}

for (const c of normCollisions) {
  byNorm.delete(c);
  console.log(`  WARN: normalized collision for "${c}", skipping norm match`);
}

// --- Manual matches (from previous sessions + new Feb 04 collision resolutions) ---
const manualMatches = {
  // Previous sessions
  'RU HoangRed': 'HoangRed',
  'angNicohZ': 'ᴷᴷNicohZen',
  'angJilsss': 'ᴷᴷJilsssss',
  'voKaido父': 'voKaidoX',
  'CaptainMamoru': 'ᴷᴷJubilife',
  'Fluffy Rooster': 'Fluffy Jester',
  'A CaesaRio': 'ᴬ CaesaRio',
  'AKacemkk': 'AKacemᴷᴷ',
  'kkingdombank': 'ᴷᴷkingdombank',
  'angGiulia': 'ᴸᴹGiuliaFC',
  'IERuivinha': 'ᴵᴱRuivinha',
  'A NARDS79': 'ᴬ NARDS79',
  'RKTuranBoy': 'ᴿᴷTuranBoy',
  'LORD IZZY 1': 'KING IZZY 1',
  'kkMcĘÑĐO': 'K҉k҉  McEñd0',
  'Givnoturds': 'ᴷᴷGivnofks',
  // Feb 04 collision resolutions
  '✖ᴋᴋREIJACK': '✖KKREİJACK',
  'ʀᴜSkyLord': 'ᴿᵁSkyLord',
  'EF SǎuVôLệ': 'EF SầuVôLệ',
  'angStulti': 'Stultitia',
  'FATIH ꪶꪶ': 'FATIH II',
  'Toxic Vibes': 'The Witch Queen',
  'SirFaust x ♠': 'Faust x 23',
  'ᴋᴋOxnayz': 'ᴷᴷOxnayz',
  'ᴋᴋ monkey d': 'ᴷᴷ monkey d',
  'ᴋᴋDaxzZxz': 'ᴷᴷDaxzXxz',
  'ᴋᴋBrex': 'ᴷᴷBrex',
  'ᴋɴɢjiroツ': 'KNGjiroッ',
  'ᴋɴɢSOUTH': 'KNGSOUTH',
  'ᴰᴿ Rajah117': 'ᴅʀ Rajah117',
  'Fluffys Dad': 'Apollo ⊘',
};

// --- Match and categorize ---
const matched = [];
const allianceChanged = [];
const unmatched = [];

function resolve(csvName) {
  if (manualMatches[csvName]) {
    const dbName = manualMatches[csvName];
    const db = byExact.get(dbName);
    if (db) return { db, matchType: 'manual' };
  }
  if (byExact.has(csvName)) return { db: byExact.get(csvName), matchType: 'exact' };
  if (byAlt.has(csvName)) return { db: byAlt.get(csvName), matchType: 'alt_name' };
  const norm = aggressiveNorm(csvName);
  if (norm && byNorm.has(norm)) return { db: byNorm.get(norm), matchType: 'normalized' };
  return null;
}

for (const csv of csvMembers) {
  const result = resolve(csv.name);
  if (!result) {
    unmatched.push(csv);
    continue;
  }

  const entry = { csv, db: result.db, matchType: result.matchType };

  const dbAlliance = result.db.alliance;
  const csvAlliance = csv.alliance;
  if (dbAlliance && csvAlliance && dbAlliance !== csvAlliance) {
    // All alliance changes approved by user for Feb 04
    entry.approvedAllianceChange = true;
    matched.push(entry);
  } else {
    matched.push(entry);
  }
}

// --- Report ---
console.log(`\n=== MATCHED — SAME ALLIANCE (${matched.length}) ===\n`);
for (const { csv, db, matchType } of matched) {
  const nameNote = csv.name !== db.name ? ` (DB: ${db.name})` : '';
  const matchNote = matchType !== 'exact' ? ` [${matchType}]` : '';
  const inactive = !db.is_active ? ' [INACTIVE→ACTIVE]' : '';
  console.log(`  ${csv.name}${nameNote}${matchNote}${inactive}: ${csv.alliance || '??'}, power=${csv.power?.toLocaleString() || '-'}, honor=${csv.honor_points?.toLocaleString() || '-'}`);
}

console.log(`\n=== ALLIANCE CHANGED (${allianceChanged.length}) — REVIEW NEEDED ===\n`);
for (const { csv, db, matchType } of allianceChanged) {
  const nameNote = csv.name !== db.name ? ` (DB: ${db.name})` : '';
  console.log(`  ${csv.name}${nameNote}: DB=${db.alliance} → CSV=${csv.alliance} [${matchType}]`);
}

console.log(`\n=== UNMATCHED — NEW MEMBERS (${unmatched.length}) ===\n`);
for (const csv of unmatched) {
  console.log(`  ${csv.name}: alliance=${csv.alliance || '??'}, power=${csv.power?.toLocaleString() || '-'}, rank=${csv.rank}`);
}

// Check for DB members NOT in CSV (potential leavers)
const csvNameSet = new Set(csvMembers.map(m => m.name));
const matchedDbIds = new Set([...matched, ...allianceChanged].map(e => e.db.id));
const activeNotInCSV = allRoster.filter(m => m.is_active && !matchedDbIds.has(m.id));
console.log(`\n=== ACTIVE DB MEMBERS NOT IN CSV (${activeNotInCSV.length}) ===\n`);
for (const m of activeNotInCSV) {
  console.log(`  ${m.name}: alliance=${m.alliance}, power=${m.power?.toLocaleString() || '-'}`);
}

// Summary
console.log(`\n=== SUMMARY ===`);
console.log(`  Matched (same alliance): ${matched.length}`);
console.log(`  Alliance changed (review): ${allianceChanged.length}`);
console.log(`  Unmatched (new?): ${unmatched.length}`);
console.log(`  Active DB members not in CSV: ${activeNotInCSV.length}`);
console.log(`  With power data: ${csvMembers.filter(m => m.power !== null).length}`);
console.log(`  With honor data: ${csvMembers.filter(m => m.honor_points !== null).length}`);
console.log(`  With mobilization data: ${csvMembers.filter(m => m.mobilization_points !== null).length}`);

if (!APPLY) {
  console.log('\nDry run — no changes applied. Run with --apply to execute.');
  process.exit(0);
}

// === APPLY ===
console.log('\n=== APPLYING ===\n');

let rosterUpdated = 0;
let snapshotsCreated = 0;
let altNamesAdded = 0;

for (const entry of matched) {
  const { csv, db } = entry;

  // 1. Build roster update (only non-null fields)
  const rosterUpdate = {};
  if (csv.power !== null) rosterUpdate.power = csv.power;
  if (csv.honor_points !== null) rosterUpdate.honor_points = csv.honor_points;
  // Role: don't demote R5 to R4; map Rank to role
  const csvRole = csv.rank ? ({ 'R1': 'R1', 'R2': 'R2', 'R3': 'R3', 'R4': 'R4', 'R5': 'R5' }[csv.rank] || null) : null;
  if (csvRole && !(db.role === 'R5' && csvRole === 'R4')) {
    rosterUpdate.role = csvRole;
  }
  // Alliance: update if approved change, same alliance, or DB has no alliance
  const dbAlliance = db.alliance;
  const csvAlliance = csv.alliance;
  if (entry.approvedAllianceChange && csvAlliance) {
    rosterUpdate.alliance = csvAlliance;
  } else if (csvAlliance && (!dbAlliance || dbAlliance === csvAlliance)) {
    rosterUpdate.alliance = csvAlliance;
  }
  // Reactivate if inactive
  if (!db.is_active) {
    rosterUpdate.is_active = true;
  }

  if (Object.keys(rosterUpdate).length > 0) {
    const { error } = await sb.from('alliance_roster').update(rosterUpdate).eq('id', db.id);
    if (error) console.log(`  FAIL roster update ${db.name}: ${error.message}`);
    else rosterUpdated++;
  }

  // 2. Create snapshot using DB name (preserves special characters)
  const snapshot = {
    snapshot_date: SNAPSHOT_DATE,
    member_name: db.name,
    power: csv.power ?? db.power ?? 0,
    kills: db.kills ?? 0,
    t4_kills: db.t4_kills ?? 0,
    t5_kills: db.t5_kills ?? 0,
    honor_points: csv.honor_points ?? db.honor_points ?? 0,
    role: csvRole || db.role || 'R1',
    is_active: true,
  };

  const { error: snapErr } = await sb.from('roster_snapshots')
    .upsert(snapshot, { onConflict: 'snapshot_date,member_name' });
  if (snapErr) console.log(`  FAIL snapshot ${db.name}: ${snapErr.message}`);
  else snapshotsCreated++;

  // 3. Add alternate name if CSV name differs from DB name
  if (csv.name !== db.name) {
    const existingAlts = db.alternate_names || [];
    if (!existingAlts.includes(csv.name)) {
      const { error: altErr } = await sb.from('alliance_roster')
        .update({ alternate_names: [...existingAlts, csv.name] })
        .eq('id', db.id);
      if (altErr) console.log(`  FAIL alt name ${db.name} += ${csv.name}: ${altErr.message}`);
      else { altNamesAdded++; console.log(`  ALT NAME: ${db.name} += "${csv.name}"`); }
    }
  }
}

// 4. Create new members for unmatched
let newMembersCreated = 0;
for (const csv of unmatched) {
  if (!csv.alliance) continue;
  const csvRole = csv.rank ? ({ 'R1': 'R1', 'R2': 'R2', 'R3': 'R3', 'R4': 'R4', 'R5': 'R5' }[csv.rank] || null) : null;
  const newMember = {
    name: csv.name,
    alliance: csv.alliance,
    is_active: true,
  };
  if (csv.power !== null) newMember.power = csv.power;
  if (csv.honor_points !== null) newMember.honor_points = csv.honor_points;
  if (csvRole) newMember.role = csvRole;

  const { error: createErr } = await sb.from('alliance_roster').insert(newMember);
  if (createErr) {
    console.log(`  FAIL create ${csv.name}: ${createErr.message}`);
    continue;
  }
  console.log(`  CREATED: ${csv.name} (${csv.alliance}, power=${csv.power?.toLocaleString() || '-'})`);
  newMembersCreated++;

  // Also create snapshot for new member
  const snapshot = {
    snapshot_date: SNAPSHOT_DATE,
    member_name: csv.name,
    power: csv.power ?? 0,
    kills: 0,
    t4_kills: 0,
    t5_kills: 0,
    honor_points: csv.honor_points ?? 0,
    role: csvRole || 'R1',
    is_active: true,
  };
  const { error: snapErr } = await sb.from('roster_snapshots')
    .upsert(snapshot, { onConflict: 'snapshot_date,member_name' });
  if (snapErr) console.log(`  FAIL snapshot ${csv.name}: ${snapErr.message}`);
  else snapshotsCreated++;
}

console.log(`\nRoster updated: ${rosterUpdated}`);
console.log(`Snapshots created: ${snapshotsCreated}`);
console.log(`New members created: ${newMembersCreated}`);
console.log(`Alt names added: ${altNamesAdded}`);

// Verify
const { count } = await sb.from('roster_snapshots')
  .select('*', { count: 'exact', head: true })
  .eq('snapshot_date', SNAPSHOT_DATE);
console.log(`\nTotal snapshots for ${SNAPSHOT_DATE}: ${count}`);

console.log('\nDone');
