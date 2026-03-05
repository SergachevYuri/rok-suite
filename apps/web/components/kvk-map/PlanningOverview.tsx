'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { FEATURE_GROUPS } from '@/lib/kvk-feature-config';
import { getAchievementData } from '@/lib/kvk-achievements/data';
import { computeProgress } from '@/lib/kvk-achievements/compute-progress';
import type { KvkMapFeature, KvkAssignment, KvkAlliance } from '@/lib/kvk-map-types';

interface PlanningOverviewProps {
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
}

export default function PlanningOverview({ features, assignments, alliances }: PlanningOverviewProps) {
  // ── Assignment summary per feature group ───────────────────────────
  const groupSummary = useMemo(() => {
    const featureTypeSet = new Map(features.map((f) => [f.id, f.feature_type]));
    const assignedFeatureIds = new Set(assignments.map((a) => a.feature_id));

    return FEATURE_GROUPS
      .filter((g) => g.key !== 'flags')
      .map((group) => {
        const groupFeatures = features.filter((f) => group.types.includes(f.feature_type as typeof group.types[number]));
        const assigned = groupFeatures.filter((f) => assignedFeatureIds.has(f.id));
        return { key: group.key, label: group.label, color: group.color, total: groupFeatures.length, assigned: assigned.length };
      })
      .filter((g) => g.total > 0);
  }, [features, assignments]);

  // ── Alliance breakdown ─────────────────────────────────────────────
  const allianceBreakdown = useMemo(() => {
    const allianceMap = new Map(alliances.map((a) => [a.id, a]));
    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.alliance_id, (counts.get(a.alliance_id) || 0) + 1);
    }
    return alliances.map((a) => ({
      id: a.id,
      tag: a.tag,
      color: a.color,
      role: a.role,
      count: counts.get(a.id) || 0,
    }));
  }, [alliances, assignments]);

  // ── Achievement progress (kingdom-wide, kvk2) ─────────────────────
  const achievementSummary = useMemo(() => {
    const dataset = getAchievementData('kvk2');
    const progress = computeProgress(null, assignments, features, dataset);
    return progress.filter((c) => c.hasMapReqs);
  }, [assignments, features]);

  const totalTiers = achievementSummary.reduce((s, c) => s + c.tiers.filter((t) => t.requirements.some((r) => r.mappable)).length, 0);
  const completedTiers = achievementSummary.reduce((s, c) => s + c.tiers.filter((t) => t.mapSatisfied).length, 0);

  return (
    <div className="space-y-3 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Planning Overview
      </h3>

      {/* Assignment Summary */}
      <div className="rounded-lg p-3 border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Assignments
        </p>
        <div className="space-y-1.5">
          {groupSummary.map((g) => {
            const pct = g.total > 0 ? (g.assigned / g.total) * 100 : 0;
            return (
              <div key={g.key} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-xs flex-1" style={{ color: 'var(--foreground)' }}>{g.label}</span>
                <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--background-hover)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color, opacity: 0.7 }} />
                </div>
                <span className="text-[11px] font-medium tabular-nums w-8 text-right" style={{ color: pct === 100 ? '#22c55e' : 'var(--text-muted)' }}>
                  {g.assigned}/{g.total}
                </span>
              </div>
            );
          })}
          {groupSummary.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No features placed yet</p>
          )}
        </div>
      </div>

      {/* Alliance Breakdown */}
      {allianceBreakdown.length > 0 && (
        <div className="rounded-lg p-3 border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Alliances
          </p>
          <div className="space-y-1">
            {allianceBreakdown.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>[{a.tag}]</span>
                <span className="text-[10px] px-1 py-0.5 rounded" style={{
                  backgroundColor: a.role === 'top' ? 'rgba(245,158,11,0.15)' : 'var(--background-hover)',
                  color: a.role === 'top' ? '#f59e0b' : 'var(--text-muted)',
                }}>
                  {a.role === 'top' ? 'Top' : 'Sup'}
                </span>
                <span className="flex-1" />
                <span className="text-xs tabular-nums" style={{ color: a.count > 0 ? 'var(--foreground)' : 'var(--text-muted)' }}>
                  {a.count} {a.count === 1 ? 'building' : 'buildings'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievement Progress */}
      {achievementSummary.length > 0 && (
        <div className="rounded-lg p-3 border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Achievements
            </p>
            <span className="text-[11px] font-medium" style={{ color: completedTiers > 0 ? '#22c55e' : 'var(--text-muted)' }}>
              {completedTiers}/{totalTiers} tiers
            </span>
          </div>
          <div className="space-y-1">
            {achievementSummary.map((cat) => {
              const mapTiers = cat.tiers.filter((t) => t.requirements.some((r) => r.mappable));
              const done = mapTiers.filter((t) => t.mapSatisfied).length;
              return (
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
                  <span className="text-xs flex-1" style={{ color: 'var(--foreground)' }}>{cat.name}</span>
                  <div className="flex gap-0.5">
                    {mapTiers.map((tier) => (
                      <span
                        key={tier.level}
                        className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px] font-bold"
                        style={{
                          backgroundColor: tier.mapSatisfied ? '#22c55e' : tier.requirements.some((r) => r.mappable && r.current > 0) ? 'rgba(251,191,36,0.25)' : 'var(--background-hover)',
                          color: tier.mapSatisfied ? '#fff' : tier.requirements.some((r) => r.mappable && r.current > 0) ? '#fbbf24' : 'var(--text-muted)',
                        }}
                      >
                        {tier.mapSatisfied ? <Check size={8} strokeWidth={3} /> : tier.level}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
