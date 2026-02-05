/**
 * Match EQ roster against rok-stats data
 *
 * Usage: npx tsx apps/web/scripts/match-eq-roster.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('Missing env vars'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

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

// Normalize names for fuzzy matching
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip common alliance tags/prefixes
function stripTags(name: string): string {
  // Common prefixes: ᵃⁿᵍ, ᵏᵏ, кк, ᴷᴷ, ᴬᶜ, ᴬᵛ, etc.
  const tagPatterns = [
    /^ᵃⁿᵍ/i, /^ᵏᵏ/i, /^кк/i, /^ᴷᴷ/i, /^ᴬᶜ/i, /^ᴬᵛ/i,
    /^ang/i, /^kk/i, /^eq/i,
    /^\*/,  // asterisk prefix
    /\s*(?:farm|alt|\d+)$/i, // farm/alt suffixes
  ];

  let result = name;
  for (const pattern of tagPatterns) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

async function main() {
  // 1. Load EQ roster
  const eqCSV = readFileSync('data/EQ_roster_20260205.csv', 'utf-8');
  const eqMembers = parseCSV(eqCSV);
  console.log(`EQ roster: ${eqMembers.length} members\n`);

  // 2. Load rok-stats data (Feb 4)
  const rokstatsCSV = readFileSync('data/PlayersRanking_20260204_084018.csv', 'utf-8');
  const rokstatsRaw = parseCSV(rokstatsCSV);

  // Filter to kingdom 3923 and build lookup maps
  const rokstats = rokstatsRaw.filter(r => r.KD === '3923');
  console.log(`ROKstats K3923: ${rokstats.length} players\n`);

  // Build lookup maps
  const rokstatsByName = new Map<string, Record<string, string>>();
  const rokstatsByNormalized = new Map<string, Record<string, string>>();
  const rokstatsByStripped = new Map<string, Record<string, string>[]>();

  for (const r of rokstats) {
    const name = r['Governor Name'];
    rokstatsByName.set(name, r);
    rokstatsByNormalized.set(normalize(name), r);

    const stripped = normalize(stripTags(name));
    if (stripped.length > 2) {
      if (!rokstatsByStripped.has(stripped)) {
        rokstatsByStripped.set(stripped, []);
      }
      rokstatsByStripped.get(stripped)!.push(r);
    }
  }

  // 3. Load existing roster from DB
  let allRoster: Array<{ id: string; name: string; alternate_names: string[] | null; alliance: string | null; is_active: boolean }> = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from('alliance_roster')
      .select('id, name, alternate_names, alliance, is_active')
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    allRoster = allRoster.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`DB roster: ${allRoster.length} members\n`);

  // Build DB lookup maps
  const dbByName = new Map<string, typeof allRoster[0]>();
  const dbByNormalized = new Map<string, typeof allRoster[0]>();
  const dbByAlt = new Map<string, typeof allRoster[0]>();

  for (const m of allRoster) {
    dbByName.set(m.name, m);
    dbByNormalized.set(normalize(m.name), m);
    if (m.alternate_names) {
      for (const alt of m.alternate_names) {
        dbByAlt.set(alt, m);
        dbByNormalized.set(normalize(alt), m);
      }
    }
  }

  // 4. Match EQ members
  const exactMatches: Array<{ eq: Record<string, string>; rokstats: Record<string, string> | null; db: typeof allRoster[0] | null }> = [];
  const fuzzyMatches: Array<{ eq: Record<string, string>; rokstats: Record<string, string> | null; db: typeof allRoster[0] | null; matchType: string }> = [];
  const noMatch: Array<{ eq: Record<string, string>; candidates: Array<{ name: string; power: string }> }> = [];

  for (const eq of eqMembers) {
    const eqName = eq.Name;
    const eqPower = parseInt(eq.Power, 10) || 0;

    // Check exact match in ROKstats
    let rokMatch = rokstatsByName.get(eqName);
    let dbMatch = dbByName.get(eqName) || dbByAlt.get(eqName);

    if (rokMatch || dbMatch) {
      exactMatches.push({ eq, rokstats: rokMatch || null, db: dbMatch || null });
      continue;
    }

    // Try normalized match
    const eqNorm = normalize(eqName);
    rokMatch = rokstatsByNormalized.get(eqNorm);
    dbMatch = dbByNormalized.get(eqNorm);

    if (rokMatch || dbMatch) {
      fuzzyMatches.push({ eq, rokstats: rokMatch || null, db: dbMatch || null, matchType: 'normalized' });
      continue;
    }

    // Try stripped name match
    const eqStripped = normalize(stripTags(eqName));
    const strippedCandidates = rokstatsByStripped.get(eqStripped) || [];

    if (strippedCandidates.length === 1) {
      fuzzyMatches.push({ eq, rokstats: strippedCandidates[0], db: null, matchType: 'stripped-unique' });
      continue;
    }

    // Try power-based matching for ambiguous cases
    if (strippedCandidates.length > 1) {
      // Find closest by power
      const closest = strippedCandidates.reduce((best, curr) => {
        const currPower = parseInt(curr.Power, 10) || 0;
        const bestPower = parseInt(best.Power, 10) || 0;
        return Math.abs(currPower - eqPower) < Math.abs(bestPower - eqPower) ? curr : best;
      });

      const closestPower = parseInt(closest.Power, 10) || 0;
      const powerDiff = Math.abs(closestPower - eqPower);
      const powerPct = eqPower > 0 ? (powerDiff / eqPower) * 100 : 100;

      if (powerPct < 10) { // Within 10% power difference
        fuzzyMatches.push({ eq, rokstats: closest, db: null, matchType: `stripped-power (${strippedCandidates.length} candidates)` });
        continue;
      }
    }

    // No match found - collect potential candidates by partial name
    const candidates: Array<{ name: string; power: string }> = [];
    const words = eqStripped.split(' ');
    for (const [stripped, list] of rokstatsByStripped.entries()) {
      for (const word of words) {
        if (word.length > 2 && stripped.includes(word)) {
          for (const c of list) {
            candidates.push({ name: c['Governor Name'], power: c.Power });
          }
        }
      }
    }

    noMatch.push({ eq, candidates: candidates.slice(0, 5) }); // Limit to 5 candidates
  }

  // 5. Print results
  console.log('='.repeat(60));
  console.log(`EXACT MATCHES: ${exactMatches.length}`);
  console.log('='.repeat(60));
  for (const m of exactMatches) {
    const inRok = m.rokstats ? '✓ ROK' : '';
    const inDB = m.db ? `✓ DB (${m.db.alliance || 'no alliance'})` : '';
    console.log(`  ${m.eq.Name} [${(parseInt(m.eq.Power)/1e6).toFixed(1)}M] → ${inRok} ${inDB}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`FUZZY MATCHES: ${fuzzyMatches.length}`);
  console.log('='.repeat(60));
  for (const m of fuzzyMatches) {
    const rokName = m.rokstats ? m.rokstats['Governor Name'] : '';
    const dbName = m.db ? m.db.name : '';
    const matchedName = rokName || dbName;
    console.log(`  ${m.eq.Name} → ${matchedName} [${m.matchType}]`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`NO MATCH: ${noMatch.length}`);
  console.log('='.repeat(60));
  for (const m of noMatch) {
    console.log(`  ${m.eq.Name} [${(parseInt(m.eq.Power)/1e6).toFixed(1)}M] ${m.eq.Rank}`);
    if (m.candidates.length > 0) {
      console.log(`    Candidates: ${m.candidates.map(c => `${c.name} (${(parseInt(c.power)/1e6).toFixed(1)}M)`).join(', ')}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total EQ members: ${eqMembers.length}`);
  console.log(`  Exact matches: ${exactMatches.length}`);
  console.log(`  Fuzzy matches: ${fuzzyMatches.length}`);
  console.log(`  No match: ${noMatch.length}`);
  console.log(`  Match rate: ${((exactMatches.length + fuzzyMatches.length) / eqMembers.length * 100).toFixed(1)}%`);
}

main().catch(console.error);
