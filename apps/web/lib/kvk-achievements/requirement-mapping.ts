import type { FeatureType } from '../kvk-map-types';
import type { AchievementRequirement } from './types';

// ── Requirement type → feature types that satisfy it ────────────────

export const REQUIREMENT_FEATURE_MAP: Record<string, FeatureType[]> = {
  // Alliance "occupy" requirements
  occupy_hieron_with_alliance: ['hieron_steel', 'hieron_thorns'],
  occupy_sanctuary_with_alliance: ['tempest_sanctuary'],
  occupy_circle_with_alliance: ['circle_nature', 'circle_vitality', 'circle_courage', 'circle_defense'],
  occupy_great_ziggurat_with_alliance: ['ziggurat'],
  occupy_crusader_fortress_other_kingdom: ['crusader_fortress'],

  // Alliance "control at end" requirements
  alliance_controlled_great_ziggurat_end: ['ziggurat'],
  alliance_controlled_hieron_end: ['hieron_steel', 'hieron_thorns'],
  alliance_controlled_sanctuary_end: ['tempest_sanctuary'],
  alliance_controlled_circles_end: ['circle_nature', 'circle_vitality', 'circle_courage', 'circle_defense'],
  alliance_controlled_crusader_fortresses_other_end: ['crusader_fortress'],

  // Kingdom "occupy" requirements
  kingdom_occupied_crusader_fortress: ['crusader_fortress'],

  // Kingdom "control at end" requirements
  kingdom_controlled_great_ziggurat_end: ['ziggurat'],
  kingdom_controlled_hierons_end: ['hieron_steel', 'hieron_thorns'],
  kingdom_controlled_sanctuaries_end: ['tempest_sanctuary'],
  kingdom_controlled_circles_end: ['circle_nature', 'circle_vitality', 'circle_courage', 'circle_defense'],
  kingdom_controlled_crusader_fortresses_other_end: ['crusader_fortress'],
};

export function isMappableRequirement(type: string): boolean {
  return type in REQUIREMENT_FEATURE_MAP;
}

// ── KvK2 structured requirements ────────────────────────────────────
// The KvK2 JSON has human-readable task strings but no structured
// requirements array. This map provides structured requirements for
// categories that have map-trackable objectives.
// Key format: "categoryId:tierLevel"

const REQUIREMENT_LABELS: Record<string, string> = {
  occupy_hieron_with_alliance: 'Occupy Hieron',
  occupy_sanctuary_with_alliance: 'Occupy Sanctuary',
  occupy_circle_with_alliance: 'Occupy Circle',
  occupy_great_ziggurat_with_alliance: 'Occupy Great Ziggurat',
  occupy_crusader_fortress_other_kingdom: 'Occupy Enemy Fortress',
  alliance_controlled_great_ziggurat_end: 'Control Ziggurat at End',
  kingdom_occupied_crusader_fortress: 'Kingdom Occupies Fortress',
  kingdom_controlled_great_ziggurat_end: 'Kingdom Controls Ziggurat at End',
  individual_honor_points: 'Individual Honor',
  kill_or_wound_enemy_units: 'Kill/Wound Troops',
};

function makeReq(type: string, target: number): AchievementRequirement {
  return { type, target, label: REQUIREMENT_LABELS[type] || type };
}

export const KVK2_TIER_REQUIREMENTS: Record<string, AchievementRequirement[]> = {
  // Alliance: Fleeting Victory
  'fleeting_victory:1': [
    makeReq('occupy_hieron_with_alliance', 1),
    makeReq('individual_honor_points', 25000),
  ],
  'fleeting_victory:2': [
    makeReq('occupy_circle_with_alliance', 1),
    makeReq('individual_honor_points', 35000),
  ],
  'fleeting_victory:3': [
    makeReq('occupy_great_ziggurat_with_alliance', 1),
    makeReq('individual_honor_points', 45000),
  ],

  // Alliance: Invasion
  'invasion:1': [
    makeReq('occupy_circle_with_alliance', 2),
    makeReq('individual_honor_points', 25000),
  ],
  'invasion:2': [
    makeReq('occupy_crusader_fortress_other_kingdom', 4),
    makeReq('individual_honor_points', 35000),
  ],

  // Alliance: Unstoppable Juggernaut
  'unstoppable_juggernaut:1': [
    makeReq('occupy_crusader_fortress_other_kingdom', 1),
    makeReq('individual_honor_points', 45000),
  ],
  'unstoppable_juggernaut:2': [
    makeReq('occupy_crusader_fortress_other_kingdom', 2),
    makeReq('kill_or_wound_enemy_units', 1800000),
  ],
  'unstoppable_juggernaut:3': [
    makeReq('occupy_crusader_fortress_other_kingdom', 3),
    makeReq('kill_or_wound_enemy_units', 2300000),
  ],
  'unstoppable_juggernaut:4': [
    makeReq('occupy_crusader_fortress_other_kingdom', 4),
    makeReq('kill_or_wound_enemy_units', 4200000),
  ],
  'unstoppable_juggernaut:5': [
    makeReq('occupy_hieron_with_alliance', 4),
    makeReq('kill_or_wound_enemy_units', 5000000),
  ],

  // Alliance: Last One Standing
  'last_one_standing:1': [
    makeReq('alliance_controlled_great_ziggurat_end', 1),
    makeReq('kill_or_wound_enemy_units', 5000000),
  ],

  // Kingdom: The Crusade Begins
  'the_crusade_begins:1': [
    makeReq('kingdom_occupied_crusader_fortress', 1),
    makeReq('individual_honor_points', 10000),
  ],

  // Kingdom: Beyond Compare
  'beyond_compare:1': [
    makeReq('occupy_circle_with_alliance', 1),
    makeReq('individual_honor_points', 30000),
  ],
  'beyond_compare:2': [
    makeReq('occupy_crusader_fortress_other_kingdom', 1),
    makeReq('individual_honor_points', 35000),
  ],
  'beyond_compare:3': [
    makeReq('occupy_crusader_fortress_other_kingdom', 1),
    makeReq('kill_or_wound_enemy_units', 4500000),
  ],
  'beyond_compare:4': [
    makeReq('occupy_hieron_with_alliance', 1),
    makeReq('individual_honor_points', 60000),
  ],

  // Kingdom: The Lost Throne
  'the_lost_throne:1': [
    makeReq('kingdom_controlled_great_ziggurat_end', 1),
    makeReq('kill_or_wound_enemy_units', 5000000),
  ],
};
