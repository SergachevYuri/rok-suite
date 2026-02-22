'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { getAchievementData, ALL_SEASONS } from '@/lib/kvk-achievements/data';
import { computeProgress } from '@/lib/kvk-achievements/compute-progress';
import { formatTarget } from '@/lib/kvk-achievements/normalize';
import type { KvkSeason } from '@/lib/kvk-achievements/types';
import type { CategoryProgress, TierProgress, RequirementProgress } from '@/lib/kvk-achievements/compute-progress';
import type { KvkMapFeature, KvkAssignment, KvkAlliance } from '@/lib/kvk-map-types';

interface AchievementProgressPanelProps {
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
  collapsed: boolean;
  onToggle: () => void;
}

// ── Tier dot indicator ──────────────────────────────────────────────

function TierDot({ tier }: { tier: TierProgress }) {
  const mapReqs = tier.requirements.filter((r) => r.mappable);
  if (mapReqs.length === 0) {
    return (
      <span
        className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px]"
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
        className="w-5 h-5 rounded-full inline-flex items-center justify-center"
        style={{ backgroundColor: '#22c55e', color: '#fff' }}
        title={`Tier ${tier.level}: ${tier.task}`}
      >
        <Check size={11} strokeWidth={3} />
      </span>
    );
  }

  // Partial progress — show fraction
  const primary = mapReqs[0];
  const fraction = `${Math.min(primary.current, primary.target)}/${primary.target}`;

  return (
    <span
      className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[8px] font-bold"
      style={{
        backgroundColor: primary.current > 0 ? 'rgba(251, 191, 36, 0.25)' : 'var(--background-hover)',
        color: primary.current > 0 ? '#fbbf24' : 'var(--text-muted)',
        border: primary.current > 0 ? '1px solid rgba(251, 191, 36, 0.4)' : 'none',
      }}
      title={`Tier ${tier.level}: ${tier.task} (${fraction})`}
    >
      {fraction}
    </span>
  );
}

// ── Expanded tier details ───────────────────────────────────────────

function TierDetail({ tier }: { tier: TierProgress }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <TierDot tier={tier} />
      <div className="flex-1 min-w-0">
        <span className="text-xs" style={{ color: 'var(--foreground)' }}>
          {tier.task}
        </span>
        <div className="flex gap-1.5 mt-0.5">
          {tier.requirements.map((req, i) => (
            <ReqBadge key={i} req={req} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReqBadge({ req }: { req: RequirementProgress }) {
  if (!req.mappable) {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded"
        style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
      >
        {formatTarget(req.target)} {req.label}
      </span>
    );
  }

  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{
        backgroundColor: req.satisfied
          ? 'rgba(34, 197, 94, 0.15)'
          : req.current > 0
            ? 'rgba(251, 191, 36, 0.15)'
            : 'var(--background-hover)',
        color: req.satisfied
          ? '#22c55e'
          : req.current > 0
            ? '#fbbf24'
            : 'var(--text-muted)',
      }}
    >
      {req.current}/{formatTarget(req.target)} {req.label}
    </span>
  );
}

// ── Category row ────────────────────────────────────────────────────

function CategoryRow({ category }: { category: CategoryProgress }) {
  const [expanded, setExpanded] = useState(false);

  const scopeLabel = category.scope === 'kingdom' ? 'Kingdom' : 'Alliance';

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:opacity-80"
        style={{
          opacity: category.hasMapReqs ? 1 : 0.5,
        }}
      >
        <span
          className="text-[9px] font-medium px-1 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: category.scope === 'kingdom' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
            color: category.scope === 'kingdom' ? '#a78bfa' : '#60a5fa',
          }}
        >
          {scopeLabel}
        </span>
        <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--foreground)' }}>
          {category.name}
        </span>
        <div className="flex gap-0.5 shrink-0">
          {category.tiers.map((tier) => (
            <TierDot key={tier.level} tier={tier} />
          ))}
        </div>
      </button>
      {expanded && (
        <div className="pl-2 pr-1 pb-1">
          {category.tiers.map((tier) => (
            <TierDetail key={tier.level} tier={tier} />
          ))}
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
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
        style={{ backgroundColor: 'var(--background-card)' }}
      >
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Achievement Progress
        </span>
        <span className="text-[10px] font-medium" style={{ color: completedMapTiers > 0 ? '#22c55e' : 'var(--text-muted)' }}>
          {completedMapTiers}/{totalMapTiers} tiers
        </span>
        <div className="flex-1" />

        {/* Season selector (inline in header) */}
        <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          {ALL_SEASONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeason(s.id)}
              className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors"
              style={{
                backgroundColor: season === s.id ? '#8b5cf6' : 'transparent',
                color: season === s.id ? '#fff' : 'var(--text-muted)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Alliance filter tabs (inline in header) */}
        <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setFilterAllianceId(null)}
            className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors"
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
              className="px-2 py-0.5 text-[10px] font-bold rounded transition-colors"
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
      </button>

      {/* Body — only when expanded */}
      {!collapsed && (
        <div
          className="overflow-y-auto px-2 pb-2"
          style={{ maxHeight: '240px', backgroundColor: 'var(--background-card)' }}
        >
          {/* Mappable achievements */}
          {mappable.length > 0 && (
            <div className="space-y-0.5">
              {mappable.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
            </div>
          )}

          {/* Non-mappable achievements */}
          {nonMappable.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[10px] font-medium px-2 mb-1" style={{ color: 'var(--text-muted)' }}>
                Manual Tracking (honor, kills, resources)
              </p>
              <div className="space-y-0.5">
                {nonMappable.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} />
                ))}
              </div>
            </div>
          )}

          {progress.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
              No achievement data for this season
            </p>
          )}
        </div>
      )}
    </div>
  );
}
