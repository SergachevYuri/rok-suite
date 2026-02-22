import type { FeatureType } from '../kvk-map-types';
import type { KvkMapFeature, KvkAssignment } from '../kvk-map-types';
import type { AchievementDataset, AchievementCategory, AchievementRequirement, AchievementScope } from './types';
import { REQUIREMENT_FEATURE_MAP, isMappableRequirement, KVK2_TIER_REQUIREMENTS } from './requirement-mapping';

// ── Progress types ──────────────────────────────────────────────────

export interface RequirementProgress {
  type: string;
  label: string;
  target: number;
  current: number;
  satisfied: boolean;
  mappable: boolean;
}

export interface TierProgress {
  level: number;
  task: string;
  requirements: RequirementProgress[];
  mapSatisfied: boolean;
}

export interface CategoryProgress {
  id: string;
  name: string;
  scope: AchievementScope;
  tiers: TierProgress[];
  highestMapTier: number;
  hasMapReqs: boolean;
}

// ── Which assignment statuses count ─────────────────────────────────

const COUNTED_STATUSES = new Set(['occupied', 'planned']);

// ── Core computation ────────────────────────────────────────────────

/**
 * Count how many features of each mappable requirement type are assigned.
 *
 * @param allianceId - Filter to this alliance. Null = kingdom-wide (all alliances).
 */
function countAssignedFeatures(
  allianceId: string | null,
  assignments: KvkAssignment[],
  featureMap: Map<string, KvkMapFeature>,
): Map<string, number> {
  // First count features by feature_type
  const featureTypeCounts = new Map<FeatureType, number>();

  for (const assignment of assignments) {
    if (!COUNTED_STATUSES.has(assignment.status)) continue;
    if (allianceId !== null && assignment.alliance_id !== allianceId) continue;

    const feature = featureMap.get(assignment.feature_id);
    if (!feature) continue;

    const ft = feature.feature_type as FeatureType;
    featureTypeCounts.set(ft, (featureTypeCounts.get(ft) || 0) + 1);
  }

  // Then map requirement types to counts by summing matching feature types
  const reqCounts = new Map<string, number>();

  for (const [reqType, featureTypes] of Object.entries(REQUIREMENT_FEATURE_MAP)) {
    let total = 0;
    for (const ft of featureTypes) {
      total += featureTypeCounts.get(ft) || 0;
    }
    if (total > 0) {
      reqCounts.set(reqType, total);
    }
  }

  return reqCounts;
}

/**
 * Get effective requirements for a tier. For crusader data, requirements
 * come from the normalized data. For KvK2 data, we supplement from
 * KVK2_TIER_REQUIREMENTS.
 */
function getEffectiveRequirements(
  categoryId: string,
  tierLevel: number,
  normalizedReqs: AchievementRequirement[],
): AchievementRequirement[] {
  // If we already have structured requirements (crusader data), use them
  if (normalizedReqs.length > 0) return normalizedReqs;

  // Check KVK2 supplement
  const key = `${categoryId}:${tierLevel}`;
  return KVK2_TIER_REQUIREMENTS[key] || [];
}

/**
 * Compute achievement progress for a given view.
 *
 * @param allianceId - null for kingdom-wide view, specific ID for per-alliance
 * @param scopeFilter - which scope(s) to include. If alliance-filtered, show 'alliance'.
 *                       If kingdom-wide, show 'kingdom'. Always include both for full picture.
 */
export function computeProgress(
  allianceId: string | null,
  assignments: KvkAssignment[],
  features: KvkMapFeature[],
  dataset: AchievementDataset,
): CategoryProgress[] {
  // Build feature lookup
  const featureMap = new Map<string, KvkMapFeature>();
  for (const f of features) featureMap.set(f.id, f);

  // Count assigned features by requirement type
  const reqCounts = countAssignedFeatures(allianceId, assignments, featureMap);

  // Determine which scopes to show
  const scopesToShow: AchievementScope[] = allianceId
    ? ['alliance']
    : ['alliance', 'kingdom'];

  const results: CategoryProgress[] = [];

  for (const scope of scopesToShow) {
    const categories: AchievementCategory[] = dataset.scopes[scope] || [];

    for (const cat of categories) {
      let hasMapReqs = false;
      let highestMapTier = 0;

      const tiers: TierProgress[] = cat.tiers.map((tier) => {
        const effectiveReqs = getEffectiveRequirements(cat.id, tier.level, tier.requirements);

        const requirements: RequirementProgress[] = effectiveReqs.map((req) => {
          const mappable = isMappableRequirement(req.type);
          if (mappable) hasMapReqs = true;

          const current = mappable ? (reqCounts.get(req.type) || 0) : 0;

          return {
            type: req.type,
            label: req.label,
            target: req.target,
            current,
            satisfied: mappable ? current >= req.target : false,
            mappable,
          };
        });

        const mapReqs = requirements.filter((r) => r.mappable);
        const mapSatisfied = mapReqs.length > 0 && mapReqs.every((r) => r.satisfied);

        if (mapSatisfied) highestMapTier = tier.level;

        return {
          level: tier.level,
          task: tier.task,
          requirements,
          mapSatisfied,
        };
      });

      results.push({
        id: `${scope}:${cat.id}`,
        name: cat.name,
        scope,
        tiers,
        highestMapTier,
        hasMapReqs,
      });
    }
  }

  // Sort: categories with map requirements first, then without
  results.sort((a, b) => {
    if (a.hasMapReqs && !b.hasMapReqs) return -1;
    if (!a.hasMapReqs && b.hasMapReqs) return 1;
    return 0;
  });

  return results;
}
