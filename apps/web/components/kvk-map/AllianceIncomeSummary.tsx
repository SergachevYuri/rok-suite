'use client';

import { useMemo } from 'react';
import type { KvkMapFeature, KvkAssignment, KvkAlliance, FeatureType } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';
import { RSS_EARNINGS_PER_HOUR, FLAG_HALF } from '@/lib/kvk-map/flag-path';
import type { RssNode, RssNodeType } from '@/lib/kvk-map/rss-review';
import { RSS_TYPE_COLORS } from '@/lib/kvk-map/rss-review';

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse "+5/m" → 5, null → 0 */
function parseHonorPerMin(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/\+?(\d+)/);
  return m ? Number(m[1]) : 0;
}

const FORTRESS_HALF = 15 / 2; // fortress tileSize=15

function getRssNodesInFlag(
  fx: number,
  fy: number,
  half: number,
  rssNodes: RssNode[],
): RssNode[] {
  return rssNodes.filter(
    (n) => Math.abs(n.x - fx) <= half && Math.abs(n.y - fy) <= half,
  );
}

// ── Types ────────────────────────────────────────────────────────────

export interface AllianceIncome {
  alliance: KvkAlliance;
  allianceHonorPerMin: number;
  kingdomHonorPerMin: number;
  individualHonorPerMin: number;
  rssPerHour: Record<RssNodeType, number>;
  totalRssPerHour: number;
  featureCount: number;
  flagCount: number;
  occupiedCount: number;
}

export interface IncomeTotals {
  allianceHonor: number;
  kingdomHonor: number;
  totalRss: number;
}

interface AllianceIncomeSummaryProps {
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
  rssNodes: RssNode[];
}

// ── Format helpers ───────────────────────────────────────────────────

function formatRss(val: number): string {
  if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  return String(val);
}

// ── Hook: compute incomes (shared between components) ────────────────

export function useAllianceIncomes(
  features: KvkMapFeature[],
  assignments: KvkAssignment[],
  alliances: KvkAlliance[],
  rssNodes: RssNode[],
) {
  const approvedRss = useMemo(
    () => rssNodes.filter((n) => n.status === 'approved'),
    [rssNodes],
  );

  const incomes = useMemo(() => {
    const featureMap = new Map(features.map((f) => [f.id, f]));
    const assignmentsByAlliance = new Map<string, KvkAssignment[]>();
    for (const a of assignments) {
      const list = assignmentsByAlliance.get(a.alliance_id) ?? [];
      list.push(a);
      assignmentsByAlliance.set(a.alliance_id, list);
    }

    const claimedNodes = new Set<number>();

    return alliances.map((alliance): AllianceIncome => {
      const allianceAssignments = assignmentsByAlliance.get(alliance.id) ?? [];
      let allianceHonorPerMin = 0;
      let kingdomHonorPerMin = 0;
      let individualHonorPerMin = 0;
      const rssPerHour: Record<RssNodeType, number> = { food: 0, wood: 0, stone: 0, gold: 0, crystal: 0 };
      let totalRssPerHour = 0;
      let featureCount = 0;
      let flagCount = 0;
      let occupiedCount = 0;

      for (const assignment of allianceAssignments) {
        const feature = featureMap.get(assignment.feature_id);
        if (!feature) continue;
        featureCount++;

        const isOccupied = assignment.status === 'occupied';
        if (isOccupied) occupiedCount++;

        const type = feature.feature_type as FeatureType;
        const config = FEATURE_TYPE_CONFIG[type];
        if (!config) continue;

        if (isOccupied) {
          allianceHonorPerMin += parseHonorPerMin(config.allianceHonor);
          kingdomHonorPerMin += parseHonorPerMin(config.kingdomHonor);
          individualHonorPerMin += parseHonorPerMin(config.individualHonor);
        }

        if (config.tileSize) {
          flagCount++;
          const half = type === 'fortress' ? FORTRESS_HALF : FLAG_HALF;
          const covered = getRssNodesInFlag(feature.x, feature.y, half, approvedRss);
          for (const node of covered) {
            if (claimedNodes.has(node.id)) continue;
            claimedNodes.add(node.id);
            const earn = RSS_EARNINGS_PER_HOUR[node.type];
            rssPerHour[node.type] += earn;
            totalRssPerHour += earn;
          }
        }
      }

      return {
        alliance,
        allianceHonorPerMin,
        kingdomHonorPerMin,
        individualHonorPerMin,
        rssPerHour,
        totalRssPerHour,
        featureCount,
        flagCount,
        occupiedCount,
      };
    });
  }, [features, assignments, alliances, approvedRss]);

  const totals = useMemo((): IncomeTotals => {
    let allianceHonor = 0;
    let kingdomHonor = 0;
    let totalRss = 0;
    for (const inc of incomes) {
      allianceHonor += inc.allianceHonorPerMin;
      kingdomHonor += inc.kingdomHonorPerMin;
      totalRss += inc.totalRssPerHour;
    }
    return { allianceHonor, kingdomHonor, totalRss };
  }, [incomes]);

  return { incomes, totals };
}

// ── Component ────────────────────────────────────────────────────────

const RSS_ORDER: RssNodeType[] = ['food', 'wood', 'stone', 'gold', 'crystal'];

export default function AllianceIncomeSummary({
  features,
  assignments,
  alliances,
  rssNodes,
}: AllianceIncomeSummaryProps) {
  const { incomes, totals } = useAllianceIncomes(features, assignments, alliances, rssNodes);

  if (alliances.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Header row */}
      <div className="flex items-center gap-3 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider w-16" style={{ color: 'var(--text-muted)' }}>
          Alliance
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider w-10 text-center" style={{ color: 'var(--text-muted)' }}>
          Feat.
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider w-20 text-center" style={{ color: '#a78bfa' }}>
          Honor/m
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-1 text-right" style={{ color: '#fbbf24' }}>
          RSS/h
        </span>
      </div>

      {/* Alliance rows */}
      {incomes.map((inc) => (
        <div
          key={inc.alliance.id}
          className="flex items-center gap-3 px-2 py-1 rounded"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-1 w-16">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: inc.alliance.color }}
            />
            <span className="text-[11px] font-bold truncate" style={{ color: inc.alliance.color }}>
              {inc.alliance.tag}
            </span>
          </div>

          <div className="w-10 text-center">
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--foreground)' }}>
              {inc.featureCount}
            </span>
            {inc.occupiedCount > 0 && (
              <span className="text-[9px] ml-0.5" style={{ color: '#22c55e' }}>
                ({inc.occupiedCount})
              </span>
            )}
          </div>

          <div className="w-20 text-center">
            {inc.allianceHonorPerMin > 0 ? (
              <span className="text-[11px] tabular-nums" style={{ color: '#a78bfa' }}>
                {inc.allianceHonorPerMin}
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-end gap-1.5">
            {inc.totalRssPerHour > 0 ? (
              <>
                {RSS_ORDER.map((type) => {
                  const val = inc.rssPerHour[type];
                  if (val === 0) return null;
                  return (
                    <div key={type} className="flex items-center gap-0.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: RSS_TYPE_COLORS[type] }}
                      />
                      <span className="text-[10px] tabular-nums" style={{ color: '#fbbf24' }}>
                        {formatRss(val)}
                      </span>
                    </div>
                  );
                })}
                <span className="text-[10px] font-medium tabular-nums ml-0.5" style={{ color: '#fbbf24' }}>
                  = {formatRss(inc.totalRssPerHour)}/h
                </span>
              </>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
        </div>
      ))}

      {/* Totals row */}
      {(totals.allianceHonor > 0 || totals.totalRss > 0) && (
        <div
          className="flex items-center gap-3 px-2 py-1 rounded mt-0.5"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-[11px] font-semibold w-16" style={{ color: 'var(--foreground)' }}>
            Total
          </span>
          <div className="w-10" />
          <div className="w-20 text-center">
            {totals.allianceHonor > 0 ? (
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#a78bfa' }}>
                {totals.allianceHonor}/m
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
          <div className="flex-1 text-right">
            {totals.totalRss > 0 ? (
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#fbbf24' }}>
                {formatRss(totals.totalRss)}/h
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
