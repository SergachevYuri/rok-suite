import type { AchievementScope } from '../kvk-map-types';

export type KvkSeason = 'crusader' | 'kvk2';

export type { AchievementScope };

export interface AchievementRequirement {
  type: string;
  target: number;
  label: string;
}

export interface AchievementTier {
  level: number;
  task: string;
  requirements: AchievementRequirement[];
  rewards: string | null;
}

export interface AchievementCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  tiers: AchievementTier[];
  scope: AchievementScope;
  kvk3Only?: boolean;
}

export interface AchievementDataset {
  season: KvkSeason;
  label: string;
  scopes: Record<AchievementScope, AchievementCategory[]>;
}
