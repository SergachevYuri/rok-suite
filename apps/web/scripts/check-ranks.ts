import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const dryRun = process.argv.includes('--dry-run');

async function fixRanks() {
  console.log(dryRun ? 'DRY RUN - no changes will be made\n' : '');

  const { data } = await supabase
    .from('alliance_roster')
    .select('id, name, role');

  // Count current values
  const counts = new Map<string, number>();
  for (const r of data || []) {
    const role = r.role || '(null)';
    counts.set(role, (counts.get(role) || 0) + 1);
  }

  console.log('Current rank values:');
  for (const [role, count] of [...counts.entries()].sort()) {
    console.log(`  ${role}: ${count}`);
  }

  // Find records that need updating (plain numbers -> R prefix)
  const toUpdate: { id: string; name: string; oldRole: string; newRole: string }[] = [];

  for (const r of data || []) {
    if (r.role && /^[1-5]$/.test(r.role)) {
      toUpdate.push({
        id: r.id,
        name: r.name,
        oldRole: r.role,
        newRole: `R${r.role}`,
      });
    }
  }

  console.log(`\nRecords to update: ${toUpdate.length}`);
  if (toUpdate.length > 0) {
    console.log('Sample updates:');
    toUpdate.slice(0, 10).forEach(u => {
      console.log(`  ${u.name}: "${u.oldRole}" -> "${u.newRole}"`);
    });
    if (toUpdate.length > 10) {
      console.log(`  ... and ${toUpdate.length - 10} more`);
    }
  }

  if (dryRun) {
    console.log('\nDRY RUN - no changes made');
    return;
  }

  // Apply updates
  let updated = 0;
  for (const u of toUpdate) {
    const { error } = await supabase
      .from('alliance_roster')
      .update({ role: u.newRole })
      .eq('id', u.id);

    if (!error) updated++;
  }

  console.log(`\nUpdated ${updated}/${toUpdate.length} records`);
}

fixRanks();
