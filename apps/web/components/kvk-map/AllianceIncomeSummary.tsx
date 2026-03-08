'use client';

import { useState, useMemo, useEffect } from 'react';
import { Clock } from 'lucide-react';
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

interface AllianceIncome {
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

interface AllianceIncomeSummaryProps {
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
  rssNodes: RssNode[];
}

// ── Format helpers ───────────────────────────────────────────────────

function formatBigNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.floor(n));
}

// ── Occupation Calculator ────────────────────────────────────────────

function OccupationCalculator({
  totals,
}: {
  totals: { allianceHonor: number; kingdomHonor: number; totalRss: number };
}) {
  const [startTime, setStartTime] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null); // minutes

  // Tick every minute
  useEffect(() => {
    if (!startTime) { setElapsed(null); return; }
    const compute = () => {
      const start = new Date(startTime).getTime();
      if (isNaN(start)) { setElapsed(null); return; }
      const mins = (Date.now() - start) / 60_000;
      setElapsed(mins > 0 ? mins : 0);
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [startTime]);

  if (totals.allianceHonor === 0 && totals.totalRss === 0) return null;

  const elapsedHours = elapsed !== null ? elapsed / 60 : 0;
  const elapsedLabel = elapsed !== null
    ? `${Math.floor(elapsed / 60)}h ${Math.floor(elapsed % 60)}m`
    : '—';

  const totalAllianceHonor = elapsed !== null ? Math.floor(totals.allianceHonor * elapsed) : 0;
  const totalKingdomHonor = elapsed !== null ? Math.floor(totals.kingdomHonor * elapsed) : 0;
  const totalRss = elapsed !== null ? Math.floor(totals.totalRss * elapsedHours) : 0;

  return (
    <div
      className="mt-1.5 pt-1.5 px-3 pb-1"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Occupation Calculator
        </span>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>
          Started
        </label>
        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="text-[11px] px-2 py-1 rounded border bg-transparent"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
            colorScheme: 'dark',
          }}
        />
        {elapsed !== null && (
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {elapsedLabel} elapsed
          </span>
        )}
      </div>

      {elapsed !== null && elapsed > 0 && (
        <div className="flex items-center gap-4 mt-1.5 py-1 rounded-lg px-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
          <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--foreground)' }}>
            Accumulated
          </span>
          {totalAllianceHonor > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>A.Honor:</span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#a78bfa' }}>
                {formatBigNumber(totalAllianceHonor)}
              </span>
            </div>
          )}
          {totalKingdomHonor > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>K.Honor:</span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#c4b5fd' }}>
                {formatBigNumber(totalKingdomHonor)}
              </span>
            </div>
          )}
          {totalRss > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>RSS:</span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#fbbf24' }}>
                {formatBigNumber(totalRss)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────

export default function AllianceIncomeSummary({
  features,
  assignments,
  alliances,
  rssNodes,
}: AllianceIncomeSummaryProps) {
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

    // Track which RSS nodes are already claimed (first alliance to cover wins)
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

        // Honor: only count if occupied
        if (isOccupied) {
          allianceHonorPerMin += parseHonorPerMin(config.allianceHonor);
          kingdomHonorPerMin += parseHonorPerMin(config.kingdomHonor);
          individualHonorPerMin += parseHonorPerMin(config.individualHonor);
        }

        // RSS: flags and fortresses cover RSS nodes
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

  const totals = useMemo(() => {
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

  if (alliances.length === 0) return null;

  const RSS_ORDER: RssNodeType[] = ['food', 'wood', 'stone', 'gold', 'crystal'];

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header row */}
      <div className="flex items-center gap-4 px-3 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider w-20" style={{ color: 'var(--text-muted)' }}>
          Alliance
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider w-16 text-center" style={{ color: 'var(--text-muted)' }}>
          Features
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider w-28 text-center" style={{ color: '#a78bfa' }}>
          Honor/min
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-1 text-center" style={{ color: '#fbbf24' }}>
          RSS Income/h
        </span>
      </div>

      {/* Alliance rows */}
      {incomes.map((inc) => (
        <div
          key={inc.alliance.id}
          className="flex items-center gap-4 px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          {/* Alliance tag + color */}
          <div className="flex items-center gap-1.5 w-20">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: inc.alliance.color }}
            />
            <span className="text-xs font-bold truncate" style={{ color: inc.alliance.color }}>
              {inc.alliance.tag}
            </span>
          </div>

          {/* Feature counts */}
          <div className="w-16 text-center">
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--foreground)' }}>
              {inc.featureCount}
            </span>
            {inc.occupiedCount > 0 && (
              <span className="text-[10px] ml-0.5" style={{ color: '#22c55e' }}>
                ({inc.occupiedCount})
              </span>
            )}
          </div>

          {/* Honor */}
          <div className="w-28 text-center">
            {inc.allianceHonorPerMin > 0 ? (
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[11px] font-medium tabular-nums" style={{ color: '#a78bfa' }}>
                  +{inc.allianceHonorPerMin}
                </span>
                {inc.kingdomHonorPerMin > 0 && (
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    K:{inc.kingdomHonorPerMin}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>

          {/* RSS breakdown */}
          <div className="flex-1 flex items-center justify-center gap-2">
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
                        {val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : val}
                      </span>
                    </div>
                  );
                })}
                <span className="text-[10px] font-medium tabular-nums ml-1" style={{ color: '#fbbf24' }}>
                  = {inc.totalRssPerHour >= 1000 ? `${(inc.totalRssPerHour / 1000).toFixed(inc.totalRssPerHour % 1000 === 0 ? 0 : 1)}k` : inc.totalRssPerHour}/h
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
          className="flex items-center gap-4 px-3 py-1.5 rounded-lg mt-0.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderTop: '1px solid var(--border)' }}
        >
          <span className="text-[11px] font-semibold w-20" style={{ color: 'var(--foreground)' }}>
            Total
          </span>
          <div className="w-16" />
          <div className="w-28 text-center">
            {totals.allianceHonor > 0 ? (
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[11px] font-bold tabular-nums" style={{ color: '#a78bfa' }}>
                  +{totals.allianceHonor}/m
                </span>
                {totals.kingdomHonor > 0 && (
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    K:{totals.kingdomHonor}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
          <div className="flex-1 text-center">
            {totals.totalRss > 0 ? (
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#fbbf24' }}>
                {totals.totalRss >= 1000 ? `${(totals.totalRss / 1000).toFixed(totals.totalRss % 1000 === 0 ? 0 : 1)}k` : totals.totalRss}/h
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
        </div>
      )}
      {/* Occupation Calculator */}
      {(totals.allianceHonor > 0 || totals.totalRss > 0) && (
        <OccupationCalculator totals={totals} />
      )}
    </div>
  );
}
