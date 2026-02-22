import type { FeatureType } from './kvk-map-types';

export interface FeatureTypeConfig {
  label: string;
  abbreviation: string;
  color: string;
  description: string;
  buffs: string[];
  kingdomHonor: string | null;
  allianceHonor: string | null;
  defaultLevel: number | null;
}

export const FEATURE_TYPE_CONFIG: Record<FeatureType, FeatureTypeConfig> = {
  pass: {
    label: 'Pass',
    abbreviation: 'PA',
    color: '#f59e0b',
    description: 'Mountain pass between zones (level 4-6)',
    buffs: [],
    kingdomHonor: null,
    allianceHonor: null,
    defaultLevel: null,
  },
  crusader_fortress: {
    label: 'Crusader Fortress',
    abbreviation: 'CF',
    color: '#ef4444',
    description: 'Crusader Fortress',
    buffs: [],
    kingdomHonor: '+5/m',
    allianceHonor: '+5/m',
    defaultLevel: 5,
  },
  crusader_camp: {
    label: 'Crusader Camp',
    abbreviation: 'CC',
    color: '#f97316',
    description: 'Crusader Camp',
    buffs: ['Gathering Speed +25%'],
    kingdomHonor: '+1/m',
    allianceHonor: '+1/m',
    defaultLevel: 4,
  },
  hieron_steel: {
    label: 'Hieron of Steel',
    abbreviation: 'HS',
    color: '#14b8a6',
    description: 'Hieron of Steel',
    buffs: ['Troop Defense +5%'],
    kingdomHonor: '+3/m',
    allianceHonor: '+3/m',
    defaultLevel: 5,
  },
  hieron_thorns: {
    label: 'Hieron of Thorns',
    abbreviation: 'HT',
    color: '#10b981',
    description: 'Hieron of Thorns',
    buffs: ['Troop Attack +5%'],
    kingdomHonor: '+3/m',
    allianceHonor: '+3/m',
    defaultLevel: 5,
  },
  ancient_ruins: {
    label: 'Ancient Ruins',
    abbreviation: 'AR',
    color: '#a855f7',
    description: 'Ancient Ruins',
    buffs: [],
    kingdomHonor: '+15/m',
    allianceHonor: '+40/m',
    defaultLevel: null,
  },
  circle_nature: {
    label: 'Circle of Nature',
    abbreviation: 'CN',
    color: '#22c55e',
    description: 'Circle of Nature',
    buffs: ['Counterattack Damage Taken Reduction +10%'],
    kingdomHonor: '+7/m',
    allianceHonor: '+7/m',
    defaultLevel: 7,
  },
  circle_vitality: {
    label: 'Circle of Vitality',
    abbreviation: 'CV',
    color: '#06b6d4',
    description: 'Circle of Vitality',
    buffs: ['Healing Speed +30%', 'Hospital Capacity +10%'],
    kingdomHonor: '+7/m',
    allianceHonor: '+7/m',
    defaultLevel: 7,
  },
  circle_courage: {
    label: 'Circle of Courage',
    abbreviation: 'CO',
    color: '#3b82f6',
    description: 'Circle of Courage',
    buffs: ['All Damage +3%', 'Rallied Army Unit Capacity +10%'],
    kingdomHonor: '+7/m',
    allianceHonor: '+7/m',
    defaultLevel: 7,
  },
  tempest_sanctuary: {
    label: 'Tempest Sanctuary',
    abbreviation: 'TS',
    color: '#ec4899',
    description: 'Tempest Sanctuary',
    buffs: ['March Speed +10%'],
    kingdomHonor: '+5/m',
    allianceHonor: '+5/m',
    defaultLevel: 6,
  },
  altar_darkness: {
    label: 'Altar of Darkness',
    abbreviation: 'AD',
    color: '#8b5cf6',
    description: 'Altar of Darkness',
    buffs: [],
    kingdomHonor: '+25/m',
    allianceHonor: '+75/m',
    defaultLevel: null,
  },
  ziggurat: {
    label: 'The Great Ziggurat',
    abbreviation: 'ZG',
    color: '#eab308',
    description: 'The Great Ziggurat',
    buffs: ['All Damage +3%', 'Damage Taken -3%'],
    kingdomHonor: '+15/m',
    allianceHonor: '+15/m',
    defaultLevel: 8,
  },
  starting_zone: {
    label: 'Starting Zone',
    abbreviation: 'SZ',
    color: '#6b7280',
    description: 'Kingdom spawn point',
    buffs: [],
    kingdomHonor: null,
    allianceHonor: null,
    defaultLevel: null,
  },
};

export const FEATURE_TYPES_ORDERED: FeatureType[] = [
  'pass',
  'crusader_camp',
  'crusader_fortress',
  'hieron_steel',
  'hieron_thorns',
  'circle_nature',
  'circle_vitality',
  'circle_courage',
  'tempest_sanctuary',
  'ancient_ruins',
  'altar_darkness',
  'ziggurat',
  'starting_zone',
];

export const ZONE_OPTIONS = [
  { value: 1, label: 'Zone 1' },
  { value: 2, label: 'Zone 2' },
  { value: 3, label: 'Zone 3' },
  { value: 4, label: 'Zone 4' },
];
