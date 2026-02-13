/**
 * One-time script to import pre-migration governor IDs from XLSX into Supabase.
 * Usage: npx tsx apps/web/scripts/import-pre-migration.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
);

const FILE = resolve(__dirname, '../data/3923_20251218_20260205_statsExport.xlsx');

async function main() {
  // Parse XLSX
  const buf = readFileSync(FILE);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const ids = raw
    .map(row => parseInt(row['Character ID'] || row['\uFEFFCharacter ID']) || 0)
    .filter(id => id > 0);

  const uniqueIds = [...new Set(ids)];
  console.log(`Parsed ${uniqueIds.length} unique governor IDs from XLSX`);

  // Clear existing
  const { error: delError } = await sb
    .from('pre_migration_governors')
    .delete()
    .gte('governor_id', 0);

  if (delError) {
    console.error('Failed to clear table:', delError.message);
    return;
  }

  // Batch insert
  const rows = uniqueIds.map(id => ({ governor_id: id }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await sb.from('pre_migration_governors').insert(batch);
    if (error) {
      console.error(`Batch ${i} failed:`, error.message);
      return;
    }
    inserted += batch.length;
    console.log(`  Inserted ${inserted}/${rows.length}`);
  }

  console.log(`\nDone! ${inserted} governor IDs stored in pre_migration_governors.`);
}

main();
