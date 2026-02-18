import type { AllianceConfig } from './types';

export const DEFAULT_ALLIANCE_CONFIGS: AllianceConfig[] = [
  { tag: 'ANG', rank: 1, cap: 114, minPower: 20_000_000, minKp: 10_000_000, maxPowerKpRatio: 1.0, thresholdMode: 'any' },
  { tag: 'MNG', rank: 2, cap: 119, minPower: 18_000_000, minKp: 10_000_000, maxPowerKpRatio: 1.0, thresholdMode: 'all' },
  { tag: 'KNG', rank: 3, cap: 91,  minPower: 16_000_000, minKp: 10_000_000, maxPowerKpRatio: 1.0, thresholdMode: 'all' },
  { tag: 'ENG', rank: 4, cap: 96,  minPower: 14_000_000, minKp: 5_000_000,  maxPowerKpRatio: 1.0, thresholdMode: 'all' },
  { tag: 'SNG', rank: 5, cap: 88,  minPower: 10_000_000, minKp: null,       maxPowerKpRatio: null, thresholdMode: 'all' },
  { tag: 'ING', rank: 6, cap: 110, minPower: 8_000_000,  minKp: null,       maxPowerKpRatio: null, thresholdMode: 'all' },
  { tag: 'GNG', rank: 7, cap: 100, minPower: 1_000_000,  minKp: null,       maxPowerKpRatio: null, thresholdMode: 'all' },
];

export const MIGRANT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1VoYEGLmM4H1HQ-uHSwgI_8SrQM4wryGH/export?format=csv&gid=443630646';

export const INACTIVES_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1VoYEGLmM4H1HQ-uHSwgI_8SrQM4wryGH/export?format=csv&gid=4777644';

export const WANTED_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1VoYEGLmM4H1HQ-uHSwgI_8SrQM4wryGH/export?format=csv&gid=641582522';

export const WANTED_SHEET_EDIT_URL =
  'https://docs.google.com/spreadsheets/d/1VoYEGLmM4H1HQ-uHSwgI_8SrQM4wryGH/edit?gid=641582522#gid=641582522';

/** Alliance tags that belong to this kingdom */
export const KINGDOM_ALLIANCE_TAGS = ['ANG', '23KK', 'KNG', 'K23S', '23A', '23-A', 'EQ', '23SP', 'ING', 'GNG'];

/** Map in-game alliance tags → sorter display tags */
export const ALLIANCE_TAG_TO_SORTER: Record<string, string> = {
  'ANG': 'ANG',
  '23KK': 'MNG',
  'KNG': 'KNG',
  'K23S': 'SNG',
  '23A': 'ENG',
  '23-A': 'ENG',
  'EQ': 'ENG',
  '23SP': 'ING',
  'ING': 'ING',
  'GNG': 'GNG',
};

/** Alliance colors for UI display */
export const SORTER_ALLIANCE_COLORS: Record<string, string> = {
  ANG: '#ff3333',
  MNG: '#00cc4d',
  KNG: '#3399ff',
  ENG: '#9933ff',
  SNG: '#999999',
  ING: '#66cccc',
  GNG: '#cc6699',
};

/**
 * Normalize a player name by stripping alliance tag prefixes,
 * combining diacritics, and special characters.
 * Pattern from scripts/import-kingdom-stats.ts
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(ᵃⁿᵍ|ang|ᴬ |ᴸᴹ |ᴳᴸ |ᴷᴷ |ᴿᵁ|ᴬᵂ |ᴬˣ|ᴰᴿ|ᴬᶜ|ᵛⁿ |ᴵˢ|ᴵᴸ|кк|ᵏᵏ|k҉k҉|ʞʞ|メкк |23✖ )\s*/i, '')
    .replace(/[\u0300-\u036f\u0489]/g, '')
    .replace(/[^\w\s]/gi, '')
    .trim();
}

/** Clean snapshot alliance tags: strip leading ', handle noally */
export function cleanAllianceTag(raw: string): string {
  if (!raw || raw === 'noally') return '';
  return raw.replace(/^'/, '').trim().toUpperCase();
}

/** Get the sorter display tag for an in-game alliance tag */
export function toSorterTag(inGameTag: string): string {
  return ALLIANCE_TAG_TO_SORTER[inGameTag] || inGameTag;
}

/** Check if a tag is one of our kingdom alliances */
export function isKingdomAlliance(tag: string): boolean {
  return KINGDOM_ALLIANCE_TAGS.includes(tag) ||
    Object.values(ALLIANCE_TAG_TO_SORTER).includes(tag);
}

/** Format large numbers with M/K suffix */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n.toString();
}
