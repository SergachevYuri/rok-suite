import type {
  AchievementDataset,
  AchievementCategory,
  AchievementTier,
  AchievementRequirement,
  AchievementScope,
} from './types';

// ── Requirement label lookup ────────────────────────────────────────

const REQUIREMENT_LABELS: Record<string, string> = {
  individual_honor_points: 'Individual Honor',
  alliance_honor_points: 'Alliance Honor',
  kingdom_honor_points: 'Kingdom Honor',
  kill_or_wound_enemy_units: 'Kill/Wound Troops',
  occupy_ruins_or_altars_minutes: 'Occupy Ruins/Altars (min)',
  gather_resources_on_map: 'Gather Resources',
  defeat_barbarian_troops_lvl26: 'Defeat Lv26+ Barbarians',
  alliance_building_construction_minutes: 'Build Alliance Flags (min)',
  occupy_hieron_with_alliance: 'Occupy Hieron',
  occupy_sanctuary_with_alliance: 'Occupy Sanctuary',
  occupy_circle_with_alliance: 'Occupy Circle',
  occupy_great_ziggurat_with_alliance: 'Occupy Great Ziggurat',
  occupy_crusader_fortress_other_kingdom: 'Occupy Enemy Fortress',
  alliance_controlled_great_ziggurat_end: 'Control Ziggurat at End',
  alliance_controlled_hieron_end: 'Control Hierons at End',
  alliance_controlled_sanctuary_end: 'Control Sanctuaries at End',
  alliance_controlled_circles_end: 'Control Circles at End',
  alliance_controlled_crusader_fortresses_other_end: 'Control Enemy Fortresses at End',
  kingdom_controlled_great_ziggurat_end: 'Kingdom Controls Ziggurat at End',
  kingdom_controlled_hierons_end: 'Kingdom Controls Hierons at End',
  kingdom_controlled_sanctuaries_end: 'Kingdom Controls Sanctuaries at End',
  kingdom_controlled_circles_end: 'Kingdom Controls Circles at End',
  kingdom_controlled_crusader_fortresses_other_end: 'Kingdom Controls Enemy Fortresses at End',
  kingdom_occupied_crusader_fortress: 'Kingdom Occupies Fortress',
};

// ── Number formatting ───────────────────────────────────────────────

export function formatTarget(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function requirementLabel(type: string): string {
  return REQUIREMENT_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Snake_case → Title Case ─────────────────────────────────────────

function toTitleCase(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Crusader normalizer ─────────────────────────────────────────────

interface CrusaderRequirement {
  type: string;
  target: number;
}

interface CrusaderTier {
  name: string;
  requirements: CrusaderRequirement[];
}

interface CrusaderRaw {
  event: string;
  tabs: Record<string, { categories: Record<string, CrusaderTier[]> }>;
}

function buildTaskFromRequirements(reqs: AchievementRequirement[]): string {
  return reqs.map((r) => `${formatTarget(r.target)} ${r.label}`).join(' + ');
}

export function normalizeCrusader(raw: CrusaderRaw): AchievementDataset {
  const scopes: Record<AchievementScope, AchievementCategory[]> = {
    individual: [],
    alliance: [],
    kingdom: [],
  };

  for (const scope of ['individual', 'alliance', 'kingdom'] as AchievementScope[]) {
    const tab = raw.tabs[scope];
    if (!tab) continue;

    for (const [key, tiers] of Object.entries(tab.categories)) {
      const normalizedTiers: AchievementTier[] = tiers.map((tier, idx) => {
        const requirements: AchievementRequirement[] = tier.requirements.map((r) => ({
          type: r.type,
          target: r.target,
          label: requirementLabel(r.type),
        }));

        return {
          level: idx + 1,
          task: buildTaskFromRequirements(requirements),
          requirements,
          rewards: null,
        };
      });

      const primaryReqType = tiers[0]?.requirements[0]?.type || '';

      scopes[scope].push({
        id: key,
        name: toTitleCase(key),
        icon: '',
        description: requirementLabel(primaryReqType),
        tiers: normalizedTiers,
        scope,
      });
    }
  }

  return {
    season: 'crusader',
    label: 'Crusader (KvK0)',
    scopes,
  };
}

// ── KvK2 normalizer ─────────────────────────────────────────────────

interface Kvk2Tier {
  lvl: number | string;
  task: string;
  rewards: string;
}

interface Kvk2Category {
  id: string;
  category: string;
  icon: string;
  desc: string;
  kvk3Only?: boolean;
  tiers: Kvk2Tier[];
}

interface Kvk2Raw {
  season: string;
  label: string;
  individual: Kvk2Category[];
  alliance: Kvk2Category[];
  kingdom: Kvk2Category[];
}

export function normalizeKvk2(raw: Kvk2Raw): AchievementDataset {
  const scopes: Record<AchievementScope, AchievementCategory[]> = {
    individual: [],
    alliance: [],
    kingdom: [],
  };

  for (const scope of ['individual', 'alliance', 'kingdom'] as AchievementScope[]) {
    const categories = raw[scope] as Kvk2Category[];
    if (!categories) continue;

    for (const cat of categories) {
      const normalizedTiers: AchievementTier[] = cat.tiers.map((tier, idx) => ({
        level: typeof tier.lvl === 'number' ? tier.lvl : idx + 1,
        task: tier.task,
        requirements: [],
        rewards: tier.rewards,
      }));

      scopes[scope].push({
        id: cat.id,
        name: cat.category,
        icon: cat.icon,
        description: cat.desc,
        tiers: normalizedTiers,
        scope,
        kvk3Only: cat.kvk3Only || false,
      });
    }
  }

  return {
    season: 'kvk2',
    label: raw.label,
    scopes,
  };
}
