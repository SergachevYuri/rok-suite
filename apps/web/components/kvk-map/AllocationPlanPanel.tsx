'use client';

import { useMemo, useState, useEffect } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { FEATURE_GROUPS, FEATURE_TYPE_TO_GROUP } from '@/lib/kvk-feature-config';
import { REQUIREMENT_FEATURE_MAP, KVK2_TIER_REQUIREMENTS, isMappableRequirement } from '@/lib/kvk-achievements/requirement-mapping';
import { computeMinimumAllocations } from '@/lib/kvk-achievements/compute-minimums';
import { getAchievementData } from '@/lib/kvk-achievements/data';
import { isPointInPolygon } from '@/lib/kvk-map/point-in-zone';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';
import type { KvkMapFeature, KvkAssignment, KvkAlliance, KvkAllocationTarget, KvkMapZone, FeatureType } from '@/lib/kvk-map-types';

// ── Reverse mapping: group key → requirement types it satisfies ──────

const GROUP_TO_REQ_TYPES: Record<string, string[]> = {};
for (const [reqType, featureTypes] of Object.entries(REQUIREMENT_FEATURE_MAP)) {
  for (const ft of featureTypes) {
    const group = FEATURE_TYPE_TO_GROUP[ft as FeatureType];
    if (!group) continue;
    if (!GROUP_TO_REQ_TYPES[group]) GROUP_TO_REQ_TYPES[group] = [];
    if (!GROUP_TO_REQ_TYPES[group].includes(reqType)) {
      GROUP_TO_REQ_TYPES[group].push(reqType);
    }
  }
}

// ── Achievement category scoping ─────────────────────────────────────

const ALLIANCE_CATEGORIES = new Set([
  'fleeting_victory', 'invasion', 'unstoppable_juggernaut', 'last_one_standing',
]);

interface AllocationPlanPanelProps {
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
  targets: KvkAllocationTarget[];
  onUpsertTarget: (allianceId: string, featureGroup: string, count: number) => void;
  onDeleteTarget: (allianceId: string, featureGroup: string) => void;
  zones?: KvkMapZone[];
  onFocusZone?: (zoneId: string | null) => void;
}

export default function AllocationPlanPanel({
  features,
  assignments,
  alliances,
  targets,
  onUpsertTarget,
  onDeleteTarget,
  zones,
  onFocusZone,
}: AllocationPlanPanelProps) {
  // Groups to show (exclude flags)
  const planGroups = useMemo(
    () => FEATURE_GROUPS.filter((g) => g.key !== 'flags'),
    [],
  );

  // Count features per group on the map
  const featureCountByGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of features) {
      const group = FEATURE_TYPE_TO_GROUP[f.feature_type as FeatureType];
      if (group) counts[group] = (counts[group] || 0) + 1;
    }
    return counts;
  }, [features]);

  // Count concrete assignments per group
  const assignedByGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    const assignedIds = new Set(assignments.map((a) => a.feature_id));
    for (const f of features) {
      if (!assignedIds.has(f.id)) continue;
      const group = FEATURE_TYPE_TO_GROUP[f.feature_type as FeatureType];
      if (group) counts[group] = (counts[group] || 0) + 1;
    }
    return counts;
  }, [features, assignments]);

  // Target lookup: `${allianceId}:${group}` → count
  const targetLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of targets) {
      map.set(`${t.alliance_id}:${t.feature_group}`, t.target_count);
    }
    return map;
  }, [targets]);

  // Achievement ghost minimums
  const minimums = useMemo(() => computeMinimumAllocations('kvk2'), []);

  // Total targets per group (sum across alliances)
  const totalTargetByGroup = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of targets) {
      totals[t.feature_group] = (totals[t.feature_group] || 0) + t.target_count;
    }
    return totals;
  }, [targets]);

  // ── Achievement progress from targets ───────────────────────────────

  const achievementImpact = useMemo(() => {
    const dataset = getAchievementData('kvk2');

    // Build per-alliance requirement counts from targets
    const allianceReqCounts = new Map<string, Map<string, number>>();
    for (const a of alliances) {
      const reqCounts = new Map<string, number>();
      for (const group of planGroups) {
        const count = targetLookup.get(`${a.id}:${group.key}`) || 0;
        if (count === 0) continue;
        const reqTypes = GROUP_TO_REQ_TYPES[group.key] || [];
        for (const rt of reqTypes) {
          reqCounts.set(rt, (reqCounts.get(rt) || 0) + count);
        }
      }
      allianceReqCounts.set(a.id, reqCounts);
    }

    // Kingdom-wide: sum across all alliances
    const kingdomReqCounts = new Map<string, number>();
    for (const counts of allianceReqCounts.values()) {
      for (const [rt, count] of counts) {
        kingdomReqCounts.set(rt, (kingdomReqCounts.get(rt) || 0) + count);
      }
    }

    // Evaluate tiers
    type TierResult = { level: number; satisfied: boolean; partial: boolean };
    type CategoryResult = { id: string; name: string; scope: 'alliance' | 'kingdom'; tiers: TierResult[]; hasMapReqs: boolean };

    const results: CategoryResult[] = [];

    for (const scope of ['alliance', 'kingdom'] as const) {
      const categories = dataset.scopes[scope] || [];
      for (const cat of categories) {
        let hasMapReqs = false;

        const tiers: TierResult[] = cat.tiers.map((tier) => {
          // Get effective requirements
          const key = `${cat.id}:${tier.level}`;
          const reqs = tier.requirements.length > 0 ? tier.requirements : (KVK2_TIER_REQUIREMENTS[key] || []);

          const mapReqs = reqs.filter((r) => isMappableRequirement(r.type));
          if (mapReqs.length > 0) hasMapReqs = true;
          if (mapReqs.length === 0) return { level: tier.level, satisfied: false, partial: false };

          let allSatisfied = true;
          let anyPartial = false;

          for (const req of mapReqs) {
            let count = 0;
            if (scope === 'kingdom') {
              count = kingdomReqCounts.get(req.type) || 0;
            } else {
              // Alliance achievement: check if ANY alliance satisfies
              for (const counts of allianceReqCounts.values()) {
                count = Math.max(count, counts.get(req.type) || 0);
              }
            }
            if (count < req.target) allSatisfied = false;
            if (count > 0) anyPartial = true;
          }

          return { level: tier.level, satisfied: allSatisfied, partial: anyPartial && !allSatisfied };
        });

        if (hasMapReqs) {
          results.push({ id: `${scope}:${cat.id}`, name: cat.name, scope, tiers, hasMapReqs });
        }
      }
    }

    return results;
  }, [alliances, planGroups, targetLookup, targets]);

  const totalTiers = achievementImpact.reduce((s, c) => s + c.tiers.filter((t) => t.satisfied || t.partial).length + c.tiers.filter((t) => !t.satisfied && !t.partial).length, 0);
  const completedTiers = achievementImpact.reduce((s, c) => s + c.tiers.filter((t) => t.satisfied).length, 0);

  // ── Zone 1 fort plans ──────────────────────────────────────────────

  const zone1Regions = useMemo(
    () => (zones || []).filter((z) => z.zone_number === 1),
    [zones],
  );

  const zoneFortPlans = useMemo(() => {
    if (zone1Regions.length === 0) return [];
    const assignmentMap = new Map(assignments.map((a) => [a.feature_id, a]));
    const allianceMap = new Map(alliances.map((a) => [a.id, a]));
    const flagFeatures = features.filter((f) => !!FEATURE_TYPE_CONFIG[f.feature_type as keyof typeof FEATURE_TYPE_CONFIG]?.tileSize);

    return zone1Regions.map((zone) => {
      const fortsInZone = flagFeatures.filter((f) => isPointInPolygon(f.x, f.y, zone.polygon));
      const alliancesInZone: { tag: string; color: string }[] = [];
      const seen = new Set<string>();
      for (const fort of fortsInZone) {
        const assignment = assignmentMap.get(fort.id);
        if (!assignment) continue;
        const alliance = allianceMap.get(assignment.alliance_id);
        if (!alliance || seen.has(alliance.id)) continue;
        seen.add(alliance.id);
        alliancesInZone.push({ tag: alliance.tag, color: alliance.color });
      }
      return { zone, fortCount: fortsInZone.length, alliances: alliancesInZone };
    });
  }, [zone1Regions, features, assignments, alliances]);

  // ── Cell handlers ──────────────────────────────────────────────────

  const handleCellClick = (allianceId: string, group: string, e: React.MouseEvent) => {
    e.preventDefault();
    const key = `${allianceId}:${group}`;
    const current = targetLookup.get(key) || 0;
    onUpsertTarget(allianceId, group, current + 1);
  };

  const handleCellRightClick = (allianceId: string, group: string, e: React.MouseEvent) => {
    e.preventDefault();
    const key = `${allianceId}:${group}`;
    const current = targetLookup.get(key) || 0;
    if (current <= 1) {
      onDeleteTarget(allianceId, group);
    } else {
      onUpsertTarget(allianceId, group, current - 1);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  const cols = `100px repeat(${alliances.length}, 1fr) 54px`;

  // Getting Started guide — collapsible, remembered in localStorage
  const [guideOpen, setGuideOpen] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem('kvk-warroom-guide-dismissed');
    if (stored === '1') setGuideOpen(false);
  }, []);
  const toggleGuide = () => {
    const next = !guideOpen;
    setGuideOpen(next);
    localStorage.setItem('kvk-warroom-guide-dismissed', next ? '0' : '1');
  };

  return (
    <div className="space-y-3 p-3">
      {/* Getting Started guide */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={toggleGuide}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {guideOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Getting Started
        </button>
        {guideOpen && (
          <div className="px-3 pb-2.5 space-y-2">
            <div className="flex gap-2">
              <span className="text-[10px] font-bold shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>1</span>
              <div>
                <p className="text-[11px] font-medium" style={{ color: 'var(--foreground)' }}>Set building targets</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Click cells in the grid to assign counts per alliance. Right-click to decrease.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="text-[10px] font-bold shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>2</span>
              <div>
                <p className="text-[11px] font-medium" style={{ color: 'var(--foreground)' }}>Plan fort drops</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Click a zone on the map to place fortresses for each alliance.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fort Drop Plans — always visible so officers know to click zones */}
      {zone1Regions.length > 0 && onFocusZone && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
        >
          <div className="px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Fort Drop Plans
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Click a zone on the map to plan
            </p>
          </div>
          {zoneFortPlans.map(({ zone, fortCount, alliances: zoneAlliances }) => (
            <button
              key={zone.id}
              onClick={() => onFocusZone(zone.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs border-t transition-all hover:bg-white/5"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
              <span className="flex-1 text-left font-medium" style={{ color: fortCount > 0 ? 'var(--foreground)' : 'var(--text-muted)' }}>
                {zone.name}
              </span>
              {fortCount > 0 && (
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {fortCount} {fortCount === 1 ? 'fort' : 'forts'}
                </span>
              )}
              {zoneAlliances.length > 0 ? (
                <div className="flex gap-1">
                  {zoneAlliances.map((a) => (
                    <span key={a.tag} className="text-[10px] font-bold" style={{ color: a.color }}>
                      {a.tag}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
                  —
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Allocation Plan
        </h3>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          Click to add · Right-click to remove
        </p>
      </div>

      {/* Allocation Grid */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="px-2 py-1.5" />
          {alliances.map((a) => (
            <div key={a.id} className="px-1 py-1.5 text-center text-[10px] font-bold" style={{ color: a.color }}>
              {a.tag}
            </div>
          ))}
          <div className="px-1 py-1.5 text-center text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Done
          </div>
        </div>

        {/* Rows */}
        {planGroups
          .filter((g) => (featureCountByGroup[g.key] || 0) > 0)
          .map((group) => {
            const total = featureCountByGroup[group.key] || 0;
            const assigned = assignedByGroup[group.key] || 0;
            const totalTarget = totalTargetByGroup[group.key] || 0;
            const min = minimums[group.key] || 0;

            return (
              <div
                key={group.key}
                className="grid border-t"
                style={{ gridTemplateColumns: cols, borderColor: 'var(--border)' }}
              >
                {/* Group label + progress */}
                <div className="px-2 py-1.5 flex flex-col justify-center gap-0.5">
                  <span className="text-[11px] font-medium leading-tight" style={{ color: group.color }}>
                    {group.label}
                  </span>
                  {totalTarget > 0 && (
                    <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--background-hover)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, totalTarget > 0 ? (assigned / totalTarget) * 100 : 0)}%`,
                          backgroundColor: assigned >= totalTarget ? '#22c55e' : group.color,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Alliance cells */}
                {alliances.map((a) => {
                  const key = `${a.id}:${group.key}`;
                  const value = targetLookup.get(key) || 0;
                  const ghostMin = min > 0 && value === 0 ? min : null;

                  return (
                    <div
                      key={a.id}
                      className="px-1 py-1.5 flex items-center justify-center cursor-pointer select-none transition-colors"
                      style={{ minHeight: 32 }}
                      onClick={(e) => handleCellClick(a.id, group.key, e)}
                      onContextMenu={(e) => handleCellRightClick(a.id, group.key, e)}
                    >
                      {value > 0 ? (
                        <span className="text-xs font-bold tabular-nums" style={{ color: a.color }}>
                          {value}
                        </span>
                      ) : ghostMin ? (
                        <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)', opacity: 0.3 }}>
                          {ghostMin}
                        </span>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.15 }}>
                          &middot;
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Assigned / Total */}
                <div className="px-1 py-1.5 flex items-center justify-center">
                  <span
                    className="text-[11px] font-medium tabular-nums"
                    style={{ color: assigned >= total && total > 0 ? '#22c55e' : 'var(--text-muted)' }}
                  >
                    {assigned}/{total}
                  </span>
                </div>
              </div>
            );
          })}

        {/* Totals row */}
        <div className="grid border-t" style={{ gridTemplateColumns: cols, borderColor: 'var(--border)' }}>
          <div className="px-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
              Total
            </span>
          </div>
          {alliances.map((a) => {
            const total = planGroups.reduce(
              (sum, g) => sum + (targetLookup.get(`${a.id}:${g.key}`) || 0),
              0,
            );
            return (
              <div key={a.id} className="px-1 py-1.5 flex items-center justify-center">
                <span className="text-[11px] font-bold tabular-nums" style={{ color: total > 0 ? a.color : 'var(--text-muted)' }}>
                  {total || ''}
                </span>
              </div>
            );
          })}
          <div className="px-1 py-1.5 flex items-center justify-center">
            <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {Object.values(assignedByGroup).reduce((s, v) => s + v, 0)}/
              {planGroups.reduce((s, g) => s + (featureCountByGroup[g.key] || 0), 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Achievement Impact */}
      {achievementImpact.length > 0 && (
        <div
          className="rounded-lg p-3 border"
          style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Achievement Impact
            </p>
            <span
              className="text-[11px] font-medium"
              style={{ color: completedTiers > 0 ? '#22c55e' : 'var(--text-muted)' }}
            >
              {completedTiers}/{totalTiers} tiers
            </span>
          </div>
          <div className="space-y-1">
            {achievementImpact.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: cat.scope === 'kingdom' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                    color: cat.scope === 'kingdom' ? '#a78bfa' : '#60a5fa',
                  }}
                >
                  {cat.scope === 'kingdom' ? 'K' : 'A'}
                </span>
                <span className="text-xs flex-1" style={{ color: 'var(--foreground)' }}>
                  {cat.name}
                </span>
                <div className="flex gap-0.5">
                  {cat.tiers.map((tier) => (
                    <span
                      key={tier.level}
                      className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px] font-bold"
                      style={{
                        backgroundColor: tier.satisfied
                          ? '#22c55e'
                          : tier.partial
                            ? 'rgba(251,191,36,0.25)'
                            : 'var(--background-hover)',
                        color: tier.satisfied
                          ? '#fff'
                          : tier.partial
                            ? '#fbbf24'
                            : 'var(--text-muted)',
                      }}
                    >
                      {tier.satisfied ? <Check size={8} strokeWidth={3} /> : tier.level}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
