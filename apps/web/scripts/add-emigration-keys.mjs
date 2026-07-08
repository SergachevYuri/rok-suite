// One-shot script: add `replaceWithRejected` and `clearAllFlags` keys to the
// `dkp.migration` block of every locale in apps/web/messages. Uses Italian
// translations for it.json and English for the rest (officer can localize
// later). Preserves formatting by re-reading + writing with JSON.stringify
// at 2-space indent.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, '..', 'messages');

const TRANSLATIONS = {
  it: {
    replaceWithRejected: 'Sostituisci lista con REJECTED ({count})',
    clearAllFlags: 'Svuota lista emigration',
  },
  en: {
    replaceWithRejected: 'Replace list with rejected ({count})',
    clearAllFlags: 'Clear entire emigration list',
  },
};

const DEFAULT = TRANSLATIONS.en;

for (const file of readdirSync(messagesDir)) {
  if (!file.endsWith('.json')) continue;
  const locale = file.replace(/\.json$/, '');
  const path = join(messagesDir, file);
  const raw = readFileSync(path, 'utf8');
  const doc = JSON.parse(raw);
  const mig = doc?.dkp?.migration;
  if (!mig) {
    console.warn(`[${locale}] no dkp.migration block — skipped`);
    continue;
  }
  const tr = TRANSLATIONS[locale] ?? DEFAULT;
  mig.replaceWithRejected = tr.replaceWithRejected;
  mig.clearAllFlags = tr.clearAllFlags;
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`[${locale}] updated`);
}
