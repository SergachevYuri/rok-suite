// One-shot: add dkp.filters.minPowerPlaceholder to every locale.
// Italian gets a proper translation; the other 14 fall back to English so
// officers see the field working today and can localize later.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, '..', 'messages');

const TRANSLATIONS = {
  it: 'Min power (M)',
  en: 'Min power (M)',
};
const DEFAULT = TRANSLATIONS.en;

for (const file of readdirSync(messagesDir)) {
  if (!file.endsWith('.json')) continue;
  const locale = file.replace(/\.json$/, '');
  const path = join(messagesDir, file);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const filters = doc?.dkp?.filters;
  if (!filters) {
    console.warn(`[${locale}] no dkp.filters block — skipped`);
    continue;
  }
  filters.minPowerPlaceholder = TRANSLATIONS[locale] ?? DEFAULT;
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`[${locale}] updated`);
}
