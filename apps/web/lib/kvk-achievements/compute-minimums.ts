import type { KvkSeason } from './types';
import { KVK2_TIER_REQUIREMENTS, REQUIREMENT_FEATURE_MAP } from './requirement-mapping';
import { FEATURE_TYPE_TO_GROUP } from '../kvk-feature-config';
import type { FeatureType } from '../kvk-map-types';

/**
 * Compute the maximum per-group allocation any single alliance needs to
 * satisfy all achievement tiers. Used for ghost placeholder values in the
 * allocation grid.
 *
 * E.g. Unstoppable Juggernaut T5 requires 4 hierons → `{ hierons: 4 }`.
 * The result is the max across ALL tiers per group.
 */
export function computeMinimumAllocations(
  _season: KvkSeason = 'kvk2',
): Record<string, number> {
  const mins: Record<string, number> = {};

  for (const reqs of Object.values(KVK2_TIER_REQUIREMENTS)) {
    for (const req of reqs) {
      const featureTypes = REQUIREMENT_FEATURE_MAP[req.type];
      if (!featureTypes || featureTypes.length === 0) continue;

      // All feature types in a requirement map to the same group
      const group = FEATURE_TYPE_TO_GROUP[featureTypes[0] as FeatureType];
      if (!group) continue;

      mins[group] = Math.max(mins[group] || 0, req.target);
    }
  }

  return mins;
}
