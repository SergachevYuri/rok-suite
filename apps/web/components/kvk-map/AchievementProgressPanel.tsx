'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ChevronRight, Check } from 'lucide-react';
import { getAchievementData, ALL_SEASONS } from '@/lib/kvk-achievements/data';
import { computeProgress } from '@/lib/kvk-achievements/compute-progress';
import { formatTarget } from '@/lib/kvk-achievements/normalize';
import type { KvkSeason } from '@/lib/kvk-achievements/types';
import type { CategoryProgress, TierProgress, RequirementProgress } from '@/lib/kvk-achievements/compute-progress';
import type { KvkMapFeature, KvkAssignment, KvkAlliance } from '@/lib/kvk-map-types';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

interface AchievementProgressPanelProps {
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
  collapsed: boolean;
  onToggle: () => void;
}

// ── Tier badge (larger, readable) ───────────────────────────────────

function TierBadge({ tier }: { tier: TierProgress }) {
  const mapReqs = tier.requirements.filter((r) => r.mappable);

  if (mapReqs.length === 0) {
    return (
      <span
        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px]"
        style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
        title={tier.task}
      >
        —
      </span>
    );
  }

  if (tier.mapSatisfied) {
    return (
      <span
        className="w-7 h-7 rounded-full inline-flex items-center justify-center"
        style={{ backgroundColor: '#22c55e', color: '#fff' }}
        title={`Tier ${tier.level}: ${tier.task}`}
      >
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }

  const primary = mapReqs[0];
  const fraction = `${Math.min(primary.current, primary.target)}/${primary.target}`;

  return (
    <span
      className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-bold"
      style={{
        backgroundColor: primary.current > 0 ? 'rgba(251, 191, 36, 0.25)' : 'var(--background-hover)',
        color: primary.current > 0 ? '#fbbf24' : 'var(--text-muted)',
        border: primary.current > 0 ? '1.5px solid rgba(251, 191, 36, 0.4)' : '1.5px solid transparent',
      }}
      title={`Tier ${tier.level}: ${tier.task} (${fraction})`}
    >
      {fraction}
    </span>
  );
}

// ── Progress bar for expanded tier detail ────────────────────────────

function ProgressBar({ req }: { req: RequirementProgress }) {
  const pct = Math.min((req.current / req.target) * 100, 100);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>
        {req.label}
      </span>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden min-w-[40px]"
        style={{ backgroundColor: 'var(--background-hover)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: req.satisfied ? '#22c55e' : req.current > 0 ? '#fbbf24' : 'transparent',
          }}
        />
      </div>
      <span
        className="text-[11px] font-medium shrink-0 tabular-nums"
        style={{
          color: req.satisfied ? '#22c55e' : req.current > 0 ? '#fbbf24' : 'var(--text-muted)',
        }}
      >
        {req.current}/{formatTarget(req.target)}
      </span>
      {req.satisfied && <Check size={12} style={{ color: '#22c55e' }} />}
    </div>
  );
}

// ── Category row ────────────────────────────────────────────────────

function CategoryRow({ category }: { category: CategoryProgress }) {
  const [expanded, setExpanded] = useState(false);

  const scopeLabel = category.scope === 'kingdom' ? 'Kingdom' : 'Alliance';

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: expanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
        style={{ opacity: category.hasMapReqs ? 1 : 0.5 }}
      >
        <ChevronRight
          size={14}
          className="shrink-0 transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: category.scope === 'kingdom' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
            color: category.scope === 'kingdom' ? '#a78bfa' : '#60a5fa',
          }}
        >
          {scopeLabel}
        </span>
        <span className="text-sm font-medium shrink-0" style={{ color: 'var(--foreground)' }}>
          {category.name}
        </span>
        {/* Badges right next to the name */}
        <div className="flex gap-1">
          {category.tiers.map((tier) => (
            <TierBadge key={tier.level} tier={tier} />
          ))}
        </div>
      </button>

      {/* Expanded: show each tier with full progress bars */}
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {category.tiers.map((tier) => {
            const roman = ROMAN[tier.level - 1] || String(tier.level);
            return (
              <div key={tier.level} className="pl-6">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs font-bold w-6"
                    style={{ color: tier.mapSatisfied ? '#22c55e' : 'var(--text-muted)' }}
                  >
                    {roman}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--foreground)' }}>
                    {tier.task}
                  </span>
                </div>
                <div className="pl-8 space-y-1">
                  {tier.requirements.map((req, i) =>
                    req.mappable ? (
                      <ProgressBar key={i} req={req} />
                    ) : (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {formatTarget(req.target)} {req.label}
                        </span>
                        <span className="text-[10px] opacity-50" style={{ color: 'var(--text-muted)' }}>
                          (manual)
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────

export default function AchievementProgressPanel({
  features,
  assignments,
  alliances,
  collapsed,
  onToggle,
}: AchievementProgressPanelProps) {
  const [season, setSeason] = useState<KvkSeason>('kvk2');
  const [filterAllianceId, setFilterAllianceId] = useState<string | null>(null);

  const dataset = useMemo(() => getAchievementData(season), [season]);

  const progress = useMemo(
    () => computeProgress(filterAllianceId, assignments, features, dataset),
    [filterAllianceId, assignments, features, dataset],
  );

  const mappable = progress.filter((c) => c.hasMapReqs);
  const nonMappable = progress.filter((c) => !c.hasMapReqs);

  // Summary for collapsed state
  const totalMapTiers = mappable.reduce((sum, c) => sum + c.tiers.filter((t) => t.requirements.some((r) => r.mappable)).length, 0);
  const completedMapTiers = mappable.reduce((sum, c) => sum + c.tiers.filter((t) => t.mapSatisfied).length, 0);

  return (
    <div
      className="shrink-0 border-t mt-2"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Header bar — always visible */}
      <div
        className="flex items-center gap-3 px-3 py-2"
        style={{ backgroundColor: 'var(--background-card)' }}
      >
        <button onClick={onToggle} className="flex items-center gap-2">
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Achievement Progress
          </span>
          <span className="text-xs font-medium" style={{ color: completedMapTiers > 0 ? '#22c55e' : 'var(--text-muted)' }}>
            {completedMapTiers}/{totalMapTiers} tiers
          </span>
        </button>

        <div className="flex-1" />

        {/* Season selector */}
        <div className="flex gap-1">
          {ALL_SEASONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeason(s.id)}
              className="px-2.5 py-1 text-xs font-medium rounded transition-colors"
              style={{
                backgroundColor: season === s.id ? '#8b5cf6' : 'transparent',
                color: season === s.id ? '#fff' : 'var(--text-muted)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Alliance filter tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setFilterAllianceId(null)}
            className="px-2.5 py-1 text-xs font-medium rounded transition-colors"
            style={{
              backgroundColor: filterAllianceId === null ? 'var(--background-hover)' : 'transparent',
              color: filterAllianceId === null ? 'var(--foreground)' : 'var(--text-muted)',
            }}
          >
            ALL
          </button>
          {alliances.map((a) => (
            <button
              key={a.id}
              onClick={() => setFilterAllianceId(a.id)}
              className="px-2.5 py-1 text-xs font-bold rounded transition-colors"
              style={{
                backgroundColor: filterAllianceId === a.id ? a.color : 'transparent',
                color: filterAllianceId === a.id ? '#fff' : a.color,
                opacity: filterAllianceId === a.id ? 1 : 0.7,
              }}
            >
              {a.tag}
            </button>
          ))}
        </div>
      </div>

      {/* Body — only when expanded */}
      {!collapsed && (
        <div
          className="overflow-y-auto px-2 pb-2"
          style={{ maxHeight: '280px', backgroundColor: 'var(--background-card)' }}
        >
          {mappable.length > 0 && (
            <div>
              {mappable.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
            </div>
          )}

          {nonMappable.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[11px] font-medium px-3 mb-1" style={{ color: 'var(--text-muted)' }}>
                Manual Tracking (honor, kills, resources)
              </p>
              {nonMappable.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
            </div>
          )}

          {progress.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
              No achievement data for this season
            </p>
          )}
        </div>
      )}
    </div>
  );
}
