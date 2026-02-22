import type { FeatureType } from './kvk-map-types';

export interface FeatureTypeConfig {
  label: string;
  abbreviation: string;
  color: string;
  description: string;
}

export const FEATURE_TYPE_CONFIG: Record<FeatureType, FeatureTypeConfig> = {
  pass: {
    label: 'Pass',
    abbreviation: 'PA',
    color: '#f59e0b',
    description: 'Mountain pass between zones (level 1-6)',
  },
  shrine: {
    label: 'Shrine',
    abbreviation: 'SH',
    color: '#8b5cf6',
    description: 'Holy shrine with combat buffs',
  },
  altar: {
    label: 'Altar',
    abbreviation: 'AL',
    color: '#22c55e',
    description: 'Altar with economy/building buffs',
  },
  sanctum: {
    label: 'Sanctum',
    abbreviation: 'SA',
    color: '#3b82f6',
    description: 'Sanctum with commander/march buffs',
  },
  heiron: {
    label: 'Heiron',
    abbreviation: 'HE',
    color: '#14b8a6',
    description: 'Heiron fortification with various buffs',
  },
  temple: {
    label: 'Temple',
    abbreviation: 'TE',
    color: '#eab308',
    description: 'Central objective (Lost Temple / Ziggurat)',
  },
  starting_zone: {
    label: 'Starting Zone',
    abbreviation: 'SZ',
    color: '#ef4444',
    description: 'Kingdom spawn point',
  },
};

export const FEATURE_TYPES_ORDERED: FeatureType[] = [
  'pass',
  'shrine',
  'altar',
  'sanctum',
  'heiron',
  'temple',
  'starting_zone',
];

export const ZONE_OPTIONS = [
  { value: 1, label: 'Zone 1' },
  { value: 2, label: 'Zone 2' },
  { value: 3, label: 'Zone 3' },
  { value: 4, label: 'Zone 4' },
];
