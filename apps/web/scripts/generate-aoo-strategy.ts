/**
 * Generate AoO strategy from roster CSV
 * - Uses previous lane assignments where available
 * - Distributes new players by power
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const dryRun = process.argv.includes('--dry-run');

interface CsvRow {
  team: number; // 1 or 2
  name: string;
  role: string; // Coordinator, Starter, Sub
}

interface Player {
  id: number;
  name: string;
  team: number; // 0=sub, 1-3=zone
  tags: string[];
  power: number;
  assignments: { phase1: string; phase2: string; phase3: string; phase4: string };
}

interface PreviousAssignment {
  name: string;
  team: number; // zone
  tags: string[];
}

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .replace(/^\['ANG\]\s*/i, '')
    .replace(/^\[ANG\]\s*/i, '')
    .replace(/^ang\s*/i, '')
    .replace(/^ᵃⁿᵍ\s*/i, '')
    .replace(/✖/g, '')
    .replace(/乄/g, '')
    .toLowerCase()
    .trim();
}

function parseCSV(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length >= 3) {
      rows.push({
        team: parseInt(parts[0]),
        name: parts[1].trim(),
        role: parts[2].trim(),
      });
    }
  }
  return rows;
}

async function main() {
  console.log(dryRun ? 'DRY RUN - no changes will be made\n' : '');

  // Read new AoO roster
  const csvPath = path.join(__dirname, '../data/aoo_roster_2026-01-23.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvRows = parseCSV(csvContent);

  const team1Rows = csvRows.filter(r => r.team === 1);
  const team2Rows = csvRows.filter(r => r.team === 2);

  console.log(`Team 1: ${team1Rows.length} members`);
  console.log(`Team 2: ${team2Rows.length} members`);

  // Load previous assignments
  const team1JsonPath = path.join(__dirname, '../public/data/aoo-team1.json');
  const team2JsonPath = path.join(__dirname, '../public/data/aoo-team2.json');

  const prevTeam1 = JSON.parse(fs.readFileSync(team1JsonPath, 'utf-8'));
  const prevTeam2 = JSON.parse(fs.readFileSync(team2JsonPath, 'utf-8'));

  // Build lookup maps from previous assignments (by normalized name)
  const prevAssignments = new Map<string, PreviousAssignment>();

  for (const p of [...prevTeam1.players, ...prevTeam1.substitutes]) {
    prevAssignments.set(normalizeName(p.name), { name: p.name, team: p.team, tags: p.tags || [] });
  }
  for (const p of [...prevTeam2.players, ...prevTeam2.substitutes]) {
    prevAssignments.set(normalizeName(p.name), { name: p.name, team: p.team, tags: p.tags || [] });
  }

  console.log(`Previous assignments loaded: ${prevAssignments.size}`);

  // Get power data and actual names from alliance_roster
  const { data: roster } = await supabase
    .from('alliance_roster')
    .select('name, power, alternate_names')
    .eq('is_active', true);

  const powerByName = new Map<string, number>();
  const actualNameByNorm = new Map<string, string>();
  for (const m of roster || []) {
    const norm = normalizeName(m.name);
    powerByName.set(norm, m.power || 0);

    // Prefer name with 'ang' prefix - check both name and alternate_names
    let displayName = m.name;
    const allNames = [m.name, ...(m.alternate_names || [])];
    for (const n of allNames) {
      if (n.startsWith('ᵃⁿᵍ') || n.toLowerCase().startsWith('ang')) {
        displayName = n;
        break;
      }
    }
    actualNameByNorm.set(norm, displayName);
  }

  // Zone leads - these players should be assigned to specific zones as rally leaders
  const zoneLeads: Record<number, Record<number, string>> = {
    1: { // Team 1 zone leads
      1: 'Suntzu',
      2: 'Fluffy',
      3: 'Funny',
    },
    2: { // Team 2 zone leads
      1: 'SsOren',
      2: 'Draken',
      3: 'BiNganHoa',
    },
  };

  // Team-specific zone rules
  // Team 1: Only Fluffy in Zone 2, everyone else in Zone 1 or 3
  // Team 2: Only specific players in Zone 2 (from previous match)
  const team2Zone2Members = new Set(['draken', 'sonk8', 'furiaaa', 'armstrong jr xl']);

  // Team 1 specific zone assignments (override previous)
  const team1Zone1Force = new Set(['cain']); // Force these players to Zone 1
  const team1Zone3Force = new Set(['jo']); // Force these players to Zone 3 (even if listed as Sub)

  // Players who get Teleport 1st tag (Team 1)
  const team1TeleportFirst = new Set([
    'suntzu', 'fluffy', 'funny', 'fluffy queen', 'calca', 'bun', 'vael'
  ]);

  // Players who get Teleport 1st tag (Team 2)
  const team2TeleportFirst = new Set([
    'raijin', 'kailey', 'ssoren', 'draken', 'binganhoa', 'stultitia', 'glordmai', 'shorty'
  ]);

  // Generate strategy for each team
  const strategies = [];

  for (const [teamNum, rows] of [[1, team1Rows], [2, team2Rows]] as const) {
    console.log(`\n=== Processing Team ${teamNum} ===`);

    const players: Player[] = [];
    const substitutes: Player[] = [];
    let idCounter = 1;

    // Separate by role
    const coordinators = rows.filter(r => r.role === 'Coordinator');
    const starters = rows.filter(r => r.role === 'Starter');
    let subs = rows.filter(r => r.role === 'Sub');

    // For Team 1, promote certain subs to main roster
    const promotedSubs: CsvRow[] = [];
    if (teamNum === 1) {
      const toPromote = subs.filter(s => team1Zone3Force.has(normalizeName(s.name)));
      promotedSubs.push(...toPromote);
      subs = subs.filter(s => !team1Zone3Force.has(normalizeName(s.name)));
    }

    console.log(`  Coordinators: ${coordinators.length}`);
    console.log(`  Starters: ${starters.length}`);
    console.log(`  Promoted subs: ${promotedSubs.length}`);
    console.log(`  Subs: ${subs.length}`);

    // Process coordinators and starters (they go into zones)
    const mainRoster = [...coordinators, ...starters, ...promotedSubs];
    const withPrevZone: { row: CsvRow; zone: number; power: number; isCoord: boolean; isLead: boolean }[] = [];
    const withoutPrevZone: { row: CsvRow; power: number; isCoord: boolean }[] = [];

    // Get zone leads for this team
    const teamZoneLeads = zoneLeads[teamNum] || {};
    const leadNames = new Set(Object.values(teamZoneLeads).map(n => normalizeName(n)));

    for (const row of mainRoster) {
      const norm = normalizeName(row.name);
      const prev = prevAssignments.get(norm);
      const power = powerByName.get(norm) || 0;
      const isCoord = row.role === 'Coordinator';

      // Check if this player is a designated zone lead
      let assignedZone: number | null = null;
      for (const [zone, leadName] of Object.entries(teamZoneLeads)) {
        if (normalizeName(leadName) === norm) {
          assignedZone = parseInt(zone);
          break;
        }
      }

      if (assignedZone) {
        // Zone lead - assign to their designated zone
        withPrevZone.push({ row, zone: assignedZone, power, isCoord, isLead: true });
      } else if (teamNum === 1) {
        // Team 1: Only Fluffy in Zone 2, everyone else goes to Z1 or Z3
        // Check if player is forced to Zone 1
        if (team1Zone1Force.has(norm)) {
          withPrevZone.push({ row, zone: 1, power, isCoord, isLead: false });
        } else if (team1Zone3Force.has(norm)) {
          withPrevZone.push({ row, zone: 3, power, isCoord, isLead: false });
        } else if (prev && (prev.team === 1 || prev.team === 3)) {
          withPrevZone.push({ row, zone: prev.team, power, isCoord, isLead: false });
        } else {
          withoutPrevZone.push({ row, power, isCoord });
        }
      } else if (teamNum === 2) {
        // Team 2: Only specific players in Zone 2
        if (team2Zone2Members.has(norm)) {
          withPrevZone.push({ row, zone: 2, power, isCoord, isLead: false });
        } else if (prev && (prev.team === 1 || prev.team === 3)) {
          withPrevZone.push({ row, zone: prev.team, power, isCoord, isLead: false });
        } else {
          withoutPrevZone.push({ row, power, isCoord });
        }
      } else {
        withoutPrevZone.push({ row, power, isCoord });
      }
    }

    console.log(`  With previous zone: ${withPrevZone.length}`);
    console.log(`  Without previous zone: ${withoutPrevZone.length}`);

    // Count current zone distribution
    const zoneCounts = [0, 0, 0, 0]; // index 1-3 for zones
    for (const p of withPrevZone) {
      zoneCounts[p.zone]++;
    }

    // Distribute players without previous assignments
    // Sort by power descending, then round-robin to balance zones
    withoutPrevZone.sort((a, b) => b.power - a.power);

    // Target ~10 players per zone (30 total main roster)
    const targetPerZone = Math.ceil(mainRoster.length / 3);

    for (const p of withoutPrevZone) {
      // Find zone with fewest players (only Z1 and Z3, skip Z2)
      let minZone = 1;
      let minCount = zoneCounts[1];
      if (zoneCounts[3] < minCount) {
        minCount = zoneCounts[3];
        minZone = 3;
      }
      withPrevZone.push({ row: p.row, zone: minZone, power: p.power, isCoord: p.isCoord, isLead: false });
      zoneCounts[minZone]++;
    }

    console.log(`  Zone distribution: Z1=${zoneCounts[1]}, Z2=${zoneCounts[2]}, Z3=${zoneCounts[3]}`);

    // Create player objects
    for (const p of withPrevZone) {
      const tags: string[] = [];
      const norm = normalizeName(p.row.name);
      // Use actual name from alliance roster if available, otherwise use CSV name
      const displayName = actualNameByNorm.get(norm) || p.row.name;
      if (p.isLead) tags.push('Rally Leader');
      if (p.isCoord) tags.push('Coordinator');
      // Add Teleport 1st tag
      const hasTeleport = p.isLead || p.isCoord ||
        (teamNum === 1 && team1TeleportFirst.has(norm)) ||
        (teamNum === 2 && team2TeleportFirst.has(norm));
      if (hasTeleport) {
        tags.push('Teleport 1st');
      }
      tags.push('Confirmed');

      players.push({
        id: idCounter++,
        name: displayName,
        team: p.zone,
        tags,
        power: p.power,
        assignments: { phase1: '', phase2: '', phase3: '', phase4: '' },
      });
    }

    // Process substitutes
    for (const row of subs) {
      const norm = normalizeName(row.name);
      const power = powerByName.get(norm) || 0;
      // Use actual name from alliance roster if available, otherwise use CSV name
      const displayName = actualNameByNorm.get(norm) || row.name;

      substitutes.push({
        id: 100 + idCounter++,
        name: displayName,
        team: 0,
        tags: [],
        power,
        assignments: { phase1: '', phase2: '', phase3: '', phase4: '' },
      });
    }

    // Sort players by zone, then leads first, then power
    players.sort((a, b) => {
      if (a.team !== b.team) return a.team - b.team;
      const aIsLead = a.tags.includes('Rally Leader') ? 1 : 0;
      const bIsLead = b.tags.includes('Rally Leader') ? 1 : 0;
      if (aIsLead !== bIsLead) return bIsLead - aIsLead; // leads first
      return b.power - a.power;
    });

    const strategy = {
      players,
      teams: [
        { name: 'Zone 1', description: 'Lower (Left Side)' },
        { name: 'Zone 2', description: 'Ark (Center)' },
        { name: 'Zone 3', description: 'Upper (Right Side)' },
      ],
      substitutes,
      notes: '',
      mapImage: null,
      mapAssignments: {
        'obelisk-2': { team: 1, order: 1 },
        'iset-2': { team: 1, order: 2 },
        'war-1': { team: 1, order: 2 },
        'obelisk-1': { team: 2, order: 1 },
        'iset-3': { team: 2, order: 2 },
        'desert-1': { team: 2, order: 2 },
        'obelisk-3': { team: 3, order: 1 },
        'iset-1': { team: 3, order: 2 },
        'life-1': { team: 3, order: 2 },
      },
    };

    strategies.push({ teamNum, strategy });

    // Print zone breakdown
    console.log(`\n  Zone breakdown for Team ${teamNum}:`);
    for (let zone = 1; zone <= 3; zone++) {
      const zonePlayers = players.filter(p => p.team === zone);
      console.log(`    Zone ${zone} (${zonePlayers.length} players):`);
      zonePlayers.slice(0, 5).forEach(p => console.log(`      - ${p.name} (${(p.power/1000000).toFixed(1)}M)`));
      if (zonePlayers.length > 5) console.log(`      ... and ${zonePlayers.length - 5} more`);
    }
    console.log(`    Substitutes (${substitutes.length}):`);
    substitutes.slice(0, 3).forEach(p => console.log(`      - ${p.name}`));
    if (substitutes.length > 3) console.log(`      ... and ${substitutes.length - 3} more`);
  }

  if (dryRun) {
    console.log('\nDRY RUN - no changes made');
    return;
  }

  // Save to database
  console.log('\nSaving to database...');

  for (const { teamNum, strategy } of strategies) {
    const aooTeam = `team${teamNum}`;

    // Check if exists
    const { data: existing } = await supabase
      .from('aoo_strategy')
      .select('id')
      .eq('event_mode', 'main')
      .eq('aoo_team', aooTeam)
      .single();

    if (existing) {
      // Update
      const { error } = await supabase
        .from('aoo_strategy')
        .update({ data: strategy })
        .eq('id', existing.id);

      if (error) {
        console.error(`Error updating Team ${teamNum}:`, error);
      } else {
        console.log(`Updated Team ${teamNum} strategy`);
      }
    } else {
      // Insert
      const { error } = await supabase
        .from('aoo_strategy')
        .insert({
          event_mode: 'main',
          aoo_team: aooTeam,
          data: strategy,
        });

      if (error) {
        console.error(`Error inserting Team ${teamNum}:`, error);
      } else {
        console.log(`Inserted Team ${teamNum} strategy`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
