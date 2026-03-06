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
  firstTimeRewards: string[];
  /** Tile size in game coordinates (e.g. 9 for flags, 15 for fortresses). */
  tileSize?: number;
}

const CIRCLE_REWARDS = [
  '3,000 Gems',
  '100,000 Alliance Honor',
  '100,000 Kingdom Honor',
  '100x 60m Speed Up',
  '3x Targeted Teleport',
  '1x Golden Key',
];

export const FEATURE_TYPE_CONFIG: Record<FeatureType, FeatureTypeConfig> = {
  pass_4: {
    label: 'Pass (Lv4)',
    abbreviation: 'P4',
    color: '#fbbf24',
    description: 'Level 4 mountain pass',
    buffs: [],
    kingdomHonor: null,
    allianceHonor: null,
    defaultLevel: 4,
    firstTimeRewards: [],
  },
  pass_5: {
    label: 'Pass (Lv5)',
    abbreviation: 'P5',
    color: '#f59e0b',
    description: 'Level 5 mountain pass',
    buffs: [],
    kingdomHonor: null,
    allianceHonor: null,
    defaultLevel: 5,
    firstTimeRewards: [
      '1,500 Gems',
      '20,000 Alliance Honor',
      '20,000 Kingdom Honor',
      '1x Golden Key',
      '2x Territorial Teleport',
      '50x 30m Speed Up',
    ],
  },
  pass_6: {
    label: 'Pass (Lv6)',
    abbreviation: 'P6',
    color: '#d97706',
    description: 'Level 6 mountain pass',
    buffs: [],
    kingdomHonor: null,
    allianceHonor: null,
    defaultLevel: 6,
    firstTimeRewards: [
      '2,000 Gems',
      '30,000 Alliance Honor',
      '30,000 Kingdom Honor',
      '1x Golden Key',
      '3x Territorial Teleport',
      '100x 30m Speed Up',
    ],
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
    firstTimeRewards: [],
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
    firstTimeRewards: [],
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
    firstTimeRewards: [],
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
    firstTimeRewards: [],
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
    firstTimeRewards: [],
  },
  circle_nature: {
    label: 'Circle of Nature',
    abbreviation: 'CN',
    color: '#93c5fd',
    description: 'Circle of Nature',
    buffs: ['Counterattack Damage Taken Reduction +10%'],
    kingdomHonor: '+7/m',
    allianceHonor: '+7/m',
    defaultLevel: 7,
    firstTimeRewards: CIRCLE_REWARDS,
  },
  circle_vitality: {
    label: 'Circle of Vitality',
    abbreviation: 'CV',
    color: '#60a5fa',
    description: 'Circle of Vitality',
    buffs: ['Healing Speed +30%', 'Hospital Capacity +10%'],
    kingdomHonor: '+7/m',
    allianceHonor: '+7/m',
    defaultLevel: 7,
    firstTimeRewards: CIRCLE_REWARDS,
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
    firstTimeRewards: CIRCLE_REWARDS,
  },
  circle_defense: {
    label: 'Circle of Defense',
    abbreviation: 'CD',
    color: '#2563eb',
    description: 'Circle of Defense',
    buffs: ['Reinforcement Capacity +20%', 'Watchtower Damage +20%'],
    kingdomHonor: '+7/m',
    allianceHonor: '+7/m',
    defaultLevel: 7,
    firstTimeRewards: CIRCLE_REWARDS,
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
    firstTimeRewards: [],
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
    firstTimeRewards: [],
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
    firstTimeRewards: [
      '5,000 Gems',
      '200,000 Alliance Honor',
      '200,000 Kingdom Honor',
      '50x 3hr Speed Up',
      '3x Targeted Teleport',
      '1x Golden Key',
    ],
  },
  flag: {
    label: 'Flag',
    abbreviation: 'FL',
    color: '#64748b',
    description: 'Alliance flag (9×9 tiles)',
    buffs: [],
    kingdomHonor: null,
    allianceHonor: null,
    defaultLevel: null,
    firstTimeRewards: [],
    tileSize: 9,
  },
  fortress: {
    label: 'Fortress',
    abbreviation: 'FT',
    color: '#475569',
    description: 'Alliance fortress (15×15 tiles)',
    buffs: [],
    kingdomHonor: null,
    allianceHonor: null,
    defaultLevel: null,
    firstTimeRewards: [],
    tileSize: 15,
  },
};

export const FEATURE_TYPES_ORDERED: FeatureType[] = [
  'crusader_camp',
  'crusader_fortress',
  'hieron_steel',
  'hieron_thorns',
  'circle_nature',
  'circle_vitality',
  'circle_courage',
  'circle_defense',
  'tempest_sanctuary',
  'altar_darkness',
  'ancient_ruins',
  'pass_4',
  'pass_5',
  'pass_6',
  'ziggurat',
  'flag',
  'fortress',
];

export interface FeatureGroup {
  key: string;
  label: string;
  color: string;
  types: FeatureType[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  { key: 'crusaders', label: 'Crusaders', color: '#ef4444', types: ['crusader_camp', 'crusader_fortress'] },
  { key: 'hierons', label: 'Hierons', color: '#14b8a6', types: ['hieron_steel', 'hieron_thorns'] },
  { key: 'circles', label: 'Circles', color: '#3b82f6', types: ['circle_nature', 'circle_vitality', 'circle_courage', 'circle_defense'] },
  { key: 'sanctuaries', label: 'Sanctuaries', color: '#ec4899', types: ['tempest_sanctuary'] },
  { key: 'altars_ruins', label: 'Altars & Ruins', color: '#8b5cf6', types: ['altar_darkness', 'ancient_ruins'] },
  { key: 'passes', label: 'Passes', color: '#f59e0b', types: ['pass_4', 'pass_5', 'pass_6'] },
  { key: 'ziggurat', label: 'Ziggurat', color: '#eab308', types: ['ziggurat'] },
  { key: 'flags', label: 'Flags', color: '#64748b', types: ['flag', 'fortress'] },
];

// Lookup: feature type → group key
export const FEATURE_TYPE_TO_GROUP: Record<FeatureType, string> = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.types.map((t) => [t, g.key]))
) as Record<FeatureType, string>;

export const ZONE_OPTIONS = [
  { value: 1, label: 'Zone 1' },
  { value: 2, label: 'Zone 2' },
  { value: 3, label: 'Zone 3' },
  { value: 4, label: 'Zone 4' },
];
