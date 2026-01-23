/**
 * Cleanup roster - mark non-alliance members as inactive
 *
 * This script reads the valid CSV imports (Jan 11/12, Jan 20, Jan 23) and:
 * - Sets is_active = true for members appearing in ANY of those imports
 * - Sets is_active = false for members NOT appearing (preserving their data)
 *
 * The Jan 16 import is NOT used as authority (contained non-alliance members).
 *
 * Usage:
 *   npx tsx apps/web/scripts/cleanup-roster.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const dryRun = process.argv.includes('--dry-run');

// Normalize name by removing alliance prefixes and converting to comparable form
function normalizeName(name: string): string {
  let normalized = name
    // Remove bracketed prefixes
    .replace(/^\['ANG\]\s*/i, '')  // Remove ['ANG] prefix
    .replace(/^\[ANG\]\s*/i, '')   // Remove [ANG] prefix
    .replace(/^\[EQng\]\s*/i, '')  // Remove [EQng] prefix
    // Remove superscript prefixes
    .replace(/^ᵃⁿᵍ/i, '')          // Remove superscript 'ang'
    .replace(/^ᴬⁿᵍ/i, '')          // Remove superscript 'Ang'
    .replace(/^ᵏᵏ/i, '')           // Remove superscript 'kk'
    .replace(/^ᴷᴷ/i, '')           // Remove superscript 'KK'
    .replace(/^кк/i, '')           // Remove Cyrillic 'кк'
    .replace(/^ᴬᶜ/i, '')           // Remove superscript 'Ac'
    .replace(/^ᴬʷ/i, '')           // Remove superscript 'Aw'
    .replace(/^ᴬᴺᴳ/i, '')          // Remove superscript 'ANG'
    .replace(/^ᴬ\s*/i, '')         // Remove superscript 'A'
    .replace(/^ᴸᴹ/i, '')           // Remove superscript 'LM'
    .replace(/^ˢᴸ/i, '')           // Remove superscript 'sL'
    .replace(/^ᴿᵁ/i, '')           // Remove superscript 'RU'
    .replace(/^ᵛᵒ/i, '')           // Remove superscript 'vo'
    .replace(/^ᵛᶰ/i, '')           // Remove superscript 'vn'
    .replace(/^ᴵᴸ/i, '')           // Remove superscript 'IL'
    .replace(/^ᶦˢ/i, '')           // Remove superscript 'is'
    .replace(/^ᴮᴿ/i, '')           // Remove superscript 'BR'
    .replace(/^ᴮᴳ/i, '')           // Remove superscript 'BG'
    .replace(/^ᴰᴸ/i, '')           // Remove superscript 'DL'
    .replace(/^ᴳᴸ/i, '')           // Remove superscript 'GL'
    .replace(/^ᴴ乂/i, '')          // Remove 'H乂'
    .replace(/^ᴷᴺᴳ/i, '')          // Remove superscript 'KNG'
    .replace(/^ᴰᴿ/i, '')           // Remove superscript 'DR'
    .replace(/^ᴾᵀᵠ/i, '')          // Remove superscript 'PTQ'
    // Remove common text prefixes (case-insensitive)
    .replace(/^ang\s*/i, '')       // Remove 'ang' prefix
    .replace(/^KK\s*/i, '')        // Remove 'KK' prefix
    .replace(/^LM\s*/i, '')        // Remove 'LM' prefix
    .replace(/^sL/i, '')           // Remove 'sL' prefix
    .replace(/^GL\s*/i, '')        // Remove 'GL' prefix
    .replace(/^RU\s*/i, '')        // Remove 'RU' prefix
    .replace(/^VN\s*/i, '')        // Remove 'VN' prefix
    .replace(/^EF\s*/i, '')        // Remove 'EF' prefix
    .replace(/^DR\s*/i, '')        // Remove 'DR' prefix
    .replace(/^AV✖/i, '')          // Remove 'AV✖' prefix
    .replace(/^Aw\s*/i, '')        // Remove 'Aw' prefix
    .replace(/^CZA/i, '')          // Remove 'CZA' prefix
    .replace(/^PTQ\s*/i, '')       // Remove 'PTQ' prefix
    .replace(/^BINH\s*/i, '')      // Remove 'BINH' prefix
    .trim();

  // Normalize special characters in names for matching
  // Replace common character variations
  normalized = normalized
    .replace(/✖/g, '')             // Remove ✖
    .replace(/乄/g, '')            // Remove 乄
    .replace(/⚔/g, '')             // Remove ⚔
    .replace(/≠/g, '')             // Remove ≠
    .replace(/ψ/g, '')             // Remove ψ
    .replace(/メ/g, '')            // Remove メ
    .replace(/㋡/g, '')            // Remove ㋡
    .replace(/ツ/g, '')            // Remove ツ
    .replace(/々/g, '')            // Remove 々
    .replace(/亗/g, '')            // Remove 亗
    .trim();

  return normalized;
}

// Extract names from a CSV file
function extractNamesFromCSV(csvPath: string): Set<string> {
  const names = new Set<string>();

  if (!fs.existsSync(csvPath)) {
    console.log(`  Skipping (not found): ${csvPath}`);
    return names;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return names;

  const header = lines[0].toLowerCase();

  // Find the name column index
  const headerParts = header.split(',').map(h => h.trim());
  let nameIdx = headerParts.indexOf('name');
  if (nameIdx === -1) nameIdx = headerParts.indexOf('governor');

  if (nameIdx === -1) {
    console.log(`  Skipping (no name column): ${csvPath}`);
    return names;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const rawName = values[nameIdx];
    if (!rawName) continue;

    const normalizedName = normalizeName(rawName);
    if (normalizedName) {
      names.add(normalizedName.toLowerCase());
    }
  }

  console.log(`  Found ${names.size} names in: ${path.basename(csvPath)}`);
  return names;
}

async function cleanupRoster() {
  console.log('Cleanup Roster Script');
  console.log('=====================');
  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made\n');
  }

  const dataDir = path.join(__dirname, '../data');

  // List of valid CSV files (excluding Jan 16)
  const validCSVs = [
    'ang_roster_20250112.csv',        // Jan 12 roster
    'ang_honor_points_20250112.csv',  // Jan 12 honor
    'ang_honor_points_2026-01-20.csv', // Jan 20 honor
    'ang_roster_20260123.csv',        // Jan 23 roster
    'ang_honor_points_2026-01-23.csv', // Jan 23 honor
  ];

  console.log('Reading valid CSVs (Jan 11/12, Jan 20, Jan 23)...');

  // Collect all valid member names
  const validNames = new Set<string>();

  for (const csvFile of validCSVs) {
    const csvPath = path.join(dataDir, csvFile);
    const names = extractNamesFromCSV(csvPath);
    for (const name of names) {
      validNames.add(name);
    }
  }

  console.log(`\nTotal unique valid alliance members: ${validNames.size}`);

  // Fetch all roster members from database with all relevant fields for merging
  console.log('\nFetching roster from database...');
  const { data: roster, error: fetchError } = await supabase
    .from('alliance_roster')
    .select('id, name, is_active, power, kills, t4_kills, t5_kills, honor_points, deads, updated_at, alternate_names');

  if (fetchError) {
    console.error('Error fetching roster:', fetchError);
    process.exit(1);
  }

  console.log(`Found ${roster?.length || 0} total members in database`);

  // Build a map of active members by normalized name
  type RosterMember = NonNullable<typeof roster>[number];
  const activeByNormalized = new Map<string, RosterMember>();
  for (const member of roster || []) {
    if (member.is_active) {
      const normalizedName = normalizeName(member.name).toLowerCase();
      const existing = activeByNormalized.get(normalizedName);
      // Keep the one with more recent update
      if (!existing || new Date(member.updated_at) > new Date(existing.updated_at)) {
        activeByNormalized.set(normalizedName, member);
      }
    }
  }

  // Categorize members
  const toActivate: RosterMember[] = [];
  const toDeactivate: RosterMember[] = [];
  const alreadyCorrect: RosterMember[] = [];
  const toMerge: { primary: RosterMember; secondary: RosterMember }[] = [];

  for (const member of roster || []) {
    const normalizedName = normalizeName(member.name).toLowerCase();
    const isValidMember = validNames.has(normalizedName);
    const existingActive = activeByNormalized.get(normalizedName);

    if (isValidMember && !member.is_active) {
      // Would activate, but check if there's already an active member with same normalized name
      if (existingActive && existingActive.id !== member.id) {
        // This is a duplicate - determine which is primary (most recently updated)
        const memberDate = new Date(member.updated_at);
        const existingDate = new Date(existingActive.updated_at);

        if (memberDate > existingDate) {
          // The inactive one is newer - it should be primary
          toMerge.push({ primary: member, secondary: existingActive });
        } else {
          // The active one is newer - it's the primary
          toMerge.push({ primary: existingActive, secondary: member });
        }
      } else {
        toActivate.push(member);
      }
    } else if (!isValidMember && member.is_active) {
      toDeactivate.push(member);
    } else {
      alreadyCorrect.push(member);
    }
  }

  // Deduplicate merges (each pair appears once)
  const seenMerges = new Set<string>();
  const uniqueMerges = toMerge.filter(m => {
    const key = [m.primary.id, m.secondary.id].sort().join('-');
    if (seenMerges.has(key)) return false;
    seenMerges.add(key);
    return true;
  });

  console.log(`\nChanges needed:`);
  console.log(`  - To activate: ${toActivate.length}`);
  console.log(`  - To deactivate: ${toDeactivate.length}`);
  console.log(`  - Already correct: ${alreadyCorrect.length}`);
  console.log(`  - To merge (duplicates): ${uniqueMerges.length}`);

  if (uniqueMerges.length > 0) {
    console.log(`\nDuplicates to MERGE (keeping most recent, storing alternate name):`);
    uniqueMerges.forEach(({ primary, secondary }) => {
      const primaryPower = (primary.power / 1000000).toFixed(1);
      const secondaryPower = (secondary.power / 1000000).toFixed(1);
      const primaryDate = new Date(primary.updated_at).toISOString().split('T')[0];
      const secondaryDate = new Date(secondary.updated_at).toISOString().split('T')[0];
      console.log(`  - ${secondary.name} (${secondaryPower}M, ${secondaryDate}) → ${primary.name} (${primaryPower}M, ${primaryDate})`);
    });
  }

  if (toDeactivate.length > 0) {
    console.log(`\nMembers to DEACTIVATE (not in valid CSVs):`);
    toDeactivate.forEach(m => {
      const powerM = (m.power / 1000000).toFixed(1);
      console.log(`  - ${m.name} (${powerM}M power)`);
    });
  }

  if (toActivate.length > 0) {
    console.log(`\nMembers to ACTIVATE (found in valid CSVs):`);
    toActivate.forEach(m => {
      const powerM = (m.power / 1000000).toFixed(1);
      console.log(`  - ${m.name} (${powerM}M power)`);
    });
  }

  if (dryRun) {
    console.log('\nDRY RUN - No changes made. Run without --dry-run to apply changes.');
    return;
  }

  // Apply changes
  if (toDeactivate.length > 0) {
    console.log('\nDeactivating non-alliance members...');
    // Batch deactivations to avoid "Bad Request" error with too many IDs
    const BATCH_SIZE = 100;
    let deactivatedCount = 0;
    let deactivateErrors = 0;

    for (let i = 0; i < toDeactivate.length; i += BATCH_SIZE) {
      const batch = toDeactivate.slice(i, i + BATCH_SIZE);
      const { error: deactivateError } = await supabase
        .from('alliance_roster')
        .update({ is_active: false })
        .in('id', batch.map(m => m.id));

      if (deactivateError) {
        console.error(`  Error deactivating batch ${Math.floor(i / BATCH_SIZE) + 1}:`, deactivateError);
        deactivateErrors++;
      } else {
        deactivatedCount += batch.length;
      }
    }

    if (deactivateErrors === 0) {
      console.log(`  Deactivated ${deactivatedCount} members`);
    } else {
      console.log(`  Deactivated ${deactivatedCount} members (${deactivateErrors} batch errors)`);
    }
  }

  if (toActivate.length > 0) {
    console.log('\nActivating alliance members...');
    const { error: activateError } = await supabase
      .from('alliance_roster')
      .update({ is_active: true })
      .in('id', toActivate.map(m => m.id));

    if (activateError) {
      console.error('Error activating members:', activateError);
    } else {
      console.log(`  Activated ${toActivate.length} members`);
    }
  }

  // Process merges
  if (uniqueMerges.length > 0) {
    console.log('\nMerging duplicate members...');
    let mergeCount = 0;

    for (const { primary, secondary } of uniqueMerges) {
      // Merge stats - take max values
      const mergedPower = Math.max(primary.power || 0, secondary.power || 0);
      const mergedKills = Math.max(primary.kills || 0, secondary.kills || 0);
      const mergedT4Kills = Math.max(primary.t4_kills || 0, secondary.t4_kills || 0);
      const mergedT5Kills = Math.max(primary.t5_kills || 0, secondary.t5_kills || 0);
      const mergedHonor = Math.max(primary.honor_points || 0, secondary.honor_points || 0);
      const mergedDeads = Math.max(primary.deads || 0, secondary.deads || 0);

      // Build alternate names array
      const existingAlternates = primary.alternate_names || [];
      const newAlternates = [...existingAlternates];
      if (!newAlternates.includes(secondary.name)) {
        newAlternates.push(secondary.name);
      }

      // Update primary record with merged stats
      const { error: updatePrimaryError } = await supabase
        .from('alliance_roster')
        .update({
          power: mergedPower,
          kills: mergedKills,
          t4_kills: mergedT4Kills,
          t5_kills: mergedT5Kills,
          honor_points: mergedHonor,
          deads: mergedDeads,
          alternate_names: newAlternates,
          is_active: true, // Ensure primary is active
        })
        .eq('id', primary.id);

      if (updatePrimaryError) {
        console.error(`  Error updating primary ${primary.name}:`, updatePrimaryError);
        continue;
      }

      // Mark secondary as merged
      const { error: updateSecondaryError } = await supabase
        .from('alliance_roster')
        .update({
          is_active: false,
          merged_into: primary.id,
        })
        .eq('id', secondary.id);

      if (updateSecondaryError) {
        console.error(`  Error marking ${secondary.name} as merged:`, updateSecondaryError);
        continue;
      }

      // Merge snapshot history - transfer secondary's snapshots to primary's name
      // First, get dates where primary already has snapshots
      const { data: primarySnapshots } = await supabase
        .from('roster_snapshots')
        .select('snapshot_date')
        .eq('member_name', primary.name);

      const primaryDates = new Set((primarySnapshots || []).map(s => s.snapshot_date));

      // Get secondary's snapshots
      const { data: secondarySnapshots } = await supabase
        .from('roster_snapshots')
        .select('*')
        .eq('member_name', secondary.name);

      let snapshotsTransferred = 0;
      let snapshotsMerged = 0;

      for (const snapshot of secondarySnapshots || []) {
        if (primaryDates.has(snapshot.snapshot_date)) {
          // Both have snapshot on same date - merge by taking max values
          await supabase
            .from('roster_snapshots')
            .update({
              power: Math.max(snapshot.power || 0, 0), // Will be compared with existing in upsert
              kills: Math.max(snapshot.kills || 0, 0),
              t4_kills: Math.max(snapshot.t4_kills || 0, 0),
              t5_kills: Math.max(snapshot.t5_kills || 0, 0),
              honor_points: Math.max(snapshot.honor_points || 0, 0),
            })
            .eq('member_name', primary.name)
            .eq('snapshot_date', snapshot.snapshot_date)
            .lt('power', snapshot.power || 0); // Only update if secondary has higher power

          // Delete the secondary's snapshot for this date
          await supabase
            .from('roster_snapshots')
            .delete()
            .eq('member_name', secondary.name)
            .eq('snapshot_date', snapshot.snapshot_date);

          snapshotsMerged++;
        } else {
          // No conflict - rename snapshot to primary's name
          const { error: transferError } = await supabase
            .from('roster_snapshots')
            .update({ member_name: primary.name })
            .eq('id', snapshot.id);

          if (!transferError) {
            snapshotsTransferred++;
          }
        }
      }

      mergeCount++;
      console.log(`  Merged ${secondary.name} → ${primary.name} (${snapshotsTransferred} snapshots transferred, ${snapshotsMerged} merged)`);
    }

    console.log(`  Completed ${mergeCount}/${uniqueMerges.length} merges`);
  }

  console.log('\nDone! Non-alliance members are now hidden from the site but preserved in database.');
}

cleanupRoster();
