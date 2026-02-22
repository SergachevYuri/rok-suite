import crusaderRaw from '@/data/crusader_achievements.json';
import kvk2Raw from '@/data/kvk2-achievements.json';
import { normalizeCrusader, normalizeKvk2 } from './normalize';
import type { AchievementDataset, KvkSeason } from './types';

const datasets: Record<KvkSeason, AchievementDataset> = {
  crusader: normalizeCrusader(crusaderRaw as never),
  kvk2: normalizeKvk2(kvk2Raw as never),
};

export function getAchievementData(season: KvkSeason): AchievementDataset {
  return datasets[season];
}

export const ALL_SEASONS: { id: KvkSeason; label: string }[] = [
  { id: 'crusader', label: 'Crusader (KvK0)' },
  { id: 'kvk2', label: 'KvK Season 2' },
];
