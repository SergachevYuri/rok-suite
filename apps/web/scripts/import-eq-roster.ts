/**
 * Import EQ roster to database
 *
 * Usage: node --import tsx scripts/import-eq-roster.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('Missing env vars'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

const SNAPSHOT_DATE = '2026-02-05';

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    fields.push(current.trim());
    return fields;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function parseNum(s: string | undefined): number | null {
  if (!s || s.trim() === '') return null;
  const val = Number(String(s).replace(/,/g, '').replace(/"/g, ''));
  return isNaN(val) ? null : val;
}

function normalizeRank(rank: string): string | null {
  if (!rank) return null;
  const trimmed = rank.trim();
  if (/^R[1-5]$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[1-5]$/.test(trimmed)) return `R${trimmed}`;
  if (trimmed.toLowerCase() === 'leader') return 'R5';
  return trimmed.toUpperCase();
}

// Manual name mappings for fuzzy matches
const NAME_MAPPINGS: Record<string, string> = {
  'Danjc': 'danjc76',
  '*BeGod': 'BeGod',
  'クダマリR': 'クダマルR', // Typo - マリ vs マル
  'angCowl 3': 'ᵃⁿᵍCowl',
  'angCowl 5': 'ᵃⁿᵍCowl',
  'angCows 4': 'ᵃⁿᵍCowl', // Probably same person's farm
};

// Names to skip (false matches or duplicates)
const SKIP_NAMES = new Set([
  '豆しば牧場', // False match
  'دوعلا', // False match
]);

async function main() {
  // 1. Load EQ roster
  const eqCSV = readFileSync('data/EQ_roster_20260205.csv', 'utf-8');
  const eqMembers = parseCSV(eqCSV);
  console.log(`EQ roster: ${eqMembers.length} members\n`);

  // 2. Load existing roster from DB
  let allRoster: Array<{ id: string; name: string; alternate_names: string[] | null; alliance: string | null; is_active: boolean; role: string | null }> = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from('alliance_roster')
      .select('id, name, alternate_names, alliance, is_active, role')
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    allRoster = allRoster.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`DB roster: ${allRoster.length} members\n`);

  // Build DB lookup maps
  const dbByName = new Map<string, typeof allRoster[0]>();
  const dbByAlt = new Map<string, typeof allRoster[0]>();

  for (const m of allRoster) {
    dbByName.set(m.name, m);
    if (m.alternate_names) {
      for (const alt of m.alternate_names) {
        dbByAlt.set(alt, m);
      }
    }
  }

  // Helper: find roster entry by name (exact, alt, or mapped)
  const findRoster = (csvName: string) => {
    // Check direct match
    if (dbByName.has(csvName)) return dbByName.get(csvName)!;
    // Check alt name match
    if (dbByAlt.has(csvName)) return dbByAlt.get(csvName)!;
    // Check mapped name
    const mapped = NAME_MAPPINGS[csvName];
    if (mapped && dbByName.has(mapped)) return dbByName.get(mapped)!;
    if (mapped && dbByAlt.has(mapped)) return dbByAlt.get(mapped)!;
    return null;
  };

  // 3. Process EQ members
  console.log('=== Processing EQ members ===\n');

  let updatedToEQ = 0;
  let inserted = 0;
  let skipped = 0;
  let alreadyEQ = 0;

  const newMembers: Array<{ name: string; power: number; role: string | null }> = [];

  for (const eq of eqMembers) {
    const csvName = eq.Name;

    // Skip known false matches
    if (SKIP_NAMES.has(csvName)) {
      console.log(`  SKIP ${csvName}: false match`);
      skipped++;
      continue;
    }

    const power = parseNum(eq.Power) ?? 0;
    const role = normalizeRank(eq.Rank);

    const entry = findRoster(csvName);

    if (entry) {
      // Member exists in DB
      if (entry.alliance === 'EQ') {
        alreadyEQ++;
        continue;
      }

      // Update alliance to EQ
      const oldAlliance = entry.alliance || 'none';
      const { error } = await supabase
        .from('alliance_roster')
        .update({
          alliance: 'EQ',
          is_active: true,
          role: role || entry.role, // Update role if provided
          power: power > 0 ? power : undefined, // Update power if provided
        })
        .eq('id', entry.id);

      if (error) {
        console.error(`  ERROR updating ${csvName}: ${error.message}`);
      } else {
        console.log(`  ✓ ${csvName} → EQ (was: ${oldAlliance})`);
        updatedToEQ++;
      }

      // Add alternate name if different from canonical name
      if (csvName !== entry.name && !entry.alternate_names?.includes(csvName)) {
        const newAlts = [...(entry.alternate_names || []), csvName];
        await supabase
          .from('alliance_roster')
          .update({ alternate_names: newAlts })
          .eq('id', entry.id);
        console.log(`    + added alt name: ${csvName}`);
      }
    } else {
      // New member - will insert
      newMembers.push({ name: csvName, power, role });
    }
  }

  // 4. Insert new members
  console.log(`\n=== Inserting ${newMembers.length} new members ===\n`);

  for (const m of newMembers) {
    const { error: rosterErr } = await supabase
      .from('alliance_roster')
      .insert({
        name: m.name,
        power: m.power,
        kills: 0,
        t4_kills: 0,
        t5_kills: 0,
        alliance: 'EQ',
        role: m.role,
        is_active: true,
      });

    if (rosterErr) {
      if (rosterErr.message.includes('duplicate')) {
        console.log(`  ~ ${m.name}: already exists, updating alliance`);
        await supabase
          .from('alliance_roster')
          .update({ alliance: 'EQ', is_active: true, role: m.role })
          .eq('name', m.name);
        updatedToEQ++;
      } else {
        console.error(`  ERROR ${m.name}: ${rosterErr.message}`);
      }
      continue;
    }

    inserted++;
    console.log(`  + ${m.name} [${(m.power / 1e6).toFixed(1)}M] ${m.role || ''}`);
  }

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total EQ roster: ${eqMembers.length}`);
  console.log(`  Updated to EQ: ${updatedToEQ}`);
  console.log(`  New members inserted: ${inserted}`);
  console.log(`  Already EQ: ${alreadyEQ}`);
  console.log(`  Skipped: ${skipped}`);

  // 6. Verification
  console.log('\n=== Verification ===\n');

  const { count: eqCount } = await supabase
    .from('alliance_roster')
    .select('id', { count: 'exact', head: true })
    .eq('alliance', 'EQ')
    .eq('is_active', true);

  console.log(`  Active EQ members in DB: ${eqCount}`);

  // List any EQ members with high power
  const { data: topEQ } = await supabase
    .from('alliance_roster')
    .select('name, power, role')
    .eq('alliance', 'EQ')
    .eq('is_active', true)
    .order('power', { ascending: false })
    .limit(10);

  console.log('\n  Top 10 EQ members by power:');
  topEQ?.forEach((m, i) => {
    console.log(`    ${i + 1}. ${m.name}: ${((m.power || 0) / 1e6).toFixed(1)}M ${m.role || ''}`);
  });
}

main().catch(console.error);
