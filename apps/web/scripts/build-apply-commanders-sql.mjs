// One-shot script: parse scripts/apply-commanders.txt (the officer-supplied
// canonical list) and generate lib/supabase/migrations/seed-apply-commanders.sql
// as a bulk-upsert. Cross-references the legacy TS archive
// (lib/sunset-canyon/commander-reference.ts) to inherit rarity, image_url, and
// — critically — preserve the historical `id` when a name matches, so old
// leader_applications rows still resolve.
//
// Run with: `node scripts/build-apply-commanders-sql.mjs` from apps/web/.
// Then execute the generated SQL on Supabase.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const TXT_PATH   = join(here, 'apply-commanders.txt');
const TS_PATH    = join(root, 'lib', 'sunset-canyon', 'commander-reference.ts');
const OUT_SQL    = join(root, 'lib', 'supabase', 'migrations', 'seed-apply-commanders.sql');

// ─── Parse the officer txt ─────────────────────────────────────────────────
// Lines look like:
//   Achilles â Cavalry | Versatility | Combo
// The `â` byte is UTF-8 for an em-dash mangled through Windows-1252 — treat
// the ` â ` sequence as the split token. Specialties are pipe-separated.
const raw = readFileSync(TXT_PATH, 'utf8');
/** @type {{ name: string; specialties: string[] }[]} */
const parsed = [];
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  // Split on ` â ` (BOM-tolerant) — em-dash appears as this two-byte string in
  // the copy-pasted source.
  const parts = trimmed.split(/\s+â\s+/);
  if (parts.length !== 2) {
    console.warn(`[skip] unexpected format: ${trimmed}`);
    continue;
  }
  const name = parts[0].trim();
  const specialtiesRaw = parts[1].split('|').map((s) => s.trim()).filter(Boolean);
  const specialties = specialtiesRaw.map((s) => {
    // Light normalization for obvious typos in the source list. Only fix
    // things that are clearly the same tag under a different spelling; leave
    // niche values (Combo, Smite, Mobility, Conquering) alone.
    if (s.toLowerCase() === 'skills') return 'Skill';
    if (s.toLowerCase() === 'versatile') return 'Versatility';
    return s;
  });
  parsed.push({ name, specialties });
}
console.log(`[parse] ${parsed.length} commanders from txt`);

// ─── Load the legacy TS archive so we can inherit rarity + preserve ids ────
// We shell-parse the file with a simple regex — good enough because the TS
// literal is well-behaved (no runtime evaluation needed).
const tsSource = readFileSync(TS_PATH, 'utf8');
/** @type {{ id: string; name: string; rarity: string; imageUrl?: string; altNames?: string[] }[]} */
const archive = [];
const entryRegex = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',[\s\S]*?rarity:\s*'([^']+)'[\s\S]*?(?:imageUrl:\s*'([^']*)')?[\s\S]*?(?:altNames:\s*\[([^\]]*)\])?[\s\S]*?\}/g;
let m;
while ((m = entryRegex.exec(tsSource)) !== null) {
  const id = m[1];
  const name = m[2];
  const rarity = m[3];
  const imageUrl = m[4] || undefined;
  const altNames = m[5]
    ? m[5].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean)
    : undefined;
  archive.push({ id, name, rarity, imageUrl, altNames });
}
console.log(`[archive] parsed ${archive.length} legacy entries from TS`);

// ─── Matching helpers ─────────────────────────────────────────────────────
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const archiveByName = new Map();
for (const a of archive) {
  archiveByName.set(norm(a.name), a);
  for (const alt of a.altNames ?? []) archiveByName.set(norm(alt), a);
}

/** Look up an archive entry for a given name — EXACT normalized match only.
 *  Fuzzy matching gets us into trouble with variants ("Frederick II" would
 *  false-match "Frederick I", "Guan Yu Prime" would swallow "Guan Yu"), so we
 *  accept that names like "Alexander Nevs" (truncated in the source) will get
 *  a fresh generated id and lose the legacy id inheritance. */
function findArchive(name) {
  return archiveByName.get(norm(name)) ?? null;
}

function toId(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')     // strip diacritics
    .replace(/['’]/g, '')                                  // apostrophes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Build rows ────────────────────────────────────────────────────────────
let matched = 0, generated = 0;
const rows = parsed.map((p, i) => {
  const legacy = findArchive(p.name);
  const id = legacy?.id ?? toId(p.name);
  if (legacy) matched++;
  else generated++;
  return {
    id,
    name: p.name,
    specialties: p.specialties,
    rarity: legacy?.rarity ?? null,
    image_url: legacy?.imageUrl ?? null,
    sort_order: i,
  };
});
console.log(`[merge] matched ${matched} against archive, ${generated} fresh ids`);

// Dedupe by id — later entries win (last-write). Prints a warning if it happens.
const byId = new Map();
for (const r of rows) {
  if (byId.has(r.id)) {
    console.warn(`[dedupe] duplicate id ${r.id} — keeping last (name=${r.name})`);
  }
  byId.set(r.id, r);
}
const finalRows = [...byId.values()];

// ─── Emit SQL ──────────────────────────────────────────────────────────────
const sqlEscape = (s) => s.replace(/'/g, "''");
const specialtiesLiteral = (arr) => `ARRAY[${arr.map((s) => `'${sqlEscape(s)}'`).join(',')}]::text[]`;
const nullOr = (v) => (v == null || v === '' ? 'null' : `'${sqlEscape(String(v))}'`);

const values = finalRows
  .map((r) =>
    `  ('${sqlEscape(r.id)}', '${sqlEscape(r.name)}', ${specialtiesLiteral(r.specialties)}, ${nullOr(r.rarity)}, ${nullOr(r.image_url)}, ${r.sort_order})`
  )
  .join(',\n');

const sql = `-- Seed data for apply_commanders. Regenerate with:
--   node scripts/build-apply-commanders-sql.mjs
--
-- Idempotent: uses INSERT ... ON CONFLICT (id) DO UPDATE so re-running with a
-- refreshed txt just applies the diff. Legacy ids from the TS archive are
-- preserved where names match, keeping past leader_applications lookups alive.

insert into public.apply_commanders (id, name, specialties, rarity, image_url, sort_order) values
${values}
on conflict (id) do update set
  name = excluded.name,
  specialties = excluded.specialties,
  rarity = excluded.rarity,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order,
  updated_at = now();
`;

writeFileSync(OUT_SQL, sql, 'utf8');
console.log(`[write] ${OUT_SQL}`);
console.log(`[done] ${finalRows.length} unique rows`);
