'use client';

import { useState } from 'react';
import { RSS_TYPE_COLORS, RSS_TYPE_LABELS, type RssNodeType } from '@/lib/kvk-map/rss-review';
import type { Waypoint, PlannedFlag, PlannedFlagStatus, FlagPathConfig, FlagPathResult } from '@/lib/kvk-map/flag-path';
import type { KvkAlliance } from '@/lib/kvk-map-types';

interface FlagPathPanelProps {
  waypoints: Waypoint[];
  flags: PlannedFlag[];
  result: FlagPathResult | null;
  config: FlagPathConfig;
  isAddingWaypoint: boolean;
  isAddingFlag: boolean;
  selectedFlagId: string | null;
  calculating: boolean;
  onConfigChange: (config: Partial<FlagPathConfig>) => void;
  onCalculate: () => void;
  onRemoveWaypoint: (id: string) => void;
  onClearWaypoints: () => void;
  onToggleAddWaypoint: () => void;
  onToggleAddFlag: () => void;
  onFlagStatusChange: (id: string, status: PlannedFlagStatus) => void;
  onFlagDelete: (id: string) => void;
  onSelectFlag: (id: string | null) => void;
  onClose: () => void;
  alliances?: KvkAlliance[];
  onApply?: (allianceId: string | null) => void;
}

const RSS_TYPE_ORDER: RssNodeType[] = ['food', 'wood', 'stone', 'gold', 'crystal'];

export default function FlagPathPanel({
  waypoints,
  flags,
  result,
  config,
  isAddingWaypoint,
  isAddingFlag,
  selectedFlagId,
  calculating,
  onConfigChange,
  onCalculate,
  onRemoveWaypoint,
  onClearWaypoints,
  onToggleAddWaypoint,
  onToggleAddFlag,
  onFlagStatusChange,
  onFlagDelete,
  onSelectFlag,
  onClose,
  alliances,
  onApply,
}: FlagPathPanelProps) {
  const plannedCount = flags.filter((f) => f.status === 'planned').length;
  const existingCount = flags.filter((f) => f.status === 'existing').length;
  const [applyAllianceId, setApplyAllianceId] = useState<string | null>(alliances?.[0]?.id ?? null);
  const [applying, setApplying] = useState(false);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3 className="text-xs font-semibold" style={{ color: '#06b6d4' }}>
          Flag Path Planner
        </h3>
        <button
          onClick={onClose}
          className="text-xs px-1.5 py-0.5 rounded hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
        >
          Close
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Waypoints */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Waypoints
            </span>
            {waypoints.length > 0 && (
              <button
                onClick={onClearWaypoints}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: '#ef4444' }}
              >
                Clear
              </button>
            )}
          </div>

          {waypoints.length === 0 ? (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Click map to place start point
            </p>
          ) : (
            <div className="space-y-1">
              {waypoints.map((wp, i) => (
                <div
                  key={wp.id}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[10px]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        i === 0 ? '#22c55e' : i === waypoints.length - 1 ? '#ef4444' : '#60a5fa',
                    }}
                  />
                  <span style={{ color: 'var(--foreground)' }}>
                    {i === 0 ? 'Start' : i === waypoints.length - 1 ? 'End' : `WP ${i}`}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    ({wp.x}, {wp.y})
                  </span>
                  <button
                    onClick={() => onRemoveWaypoint(wp.id)}
                    className="ml-auto hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onToggleAddWaypoint}
            className="w-full mt-1.5 px-2 py-1 rounded text-[10px] font-medium transition-all"
            style={{
              backgroundColor: isAddingWaypoint ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.05)',
              color: isAddingWaypoint ? '#60a5fa' : 'var(--text-muted)',
              border: `1px solid ${isAddingWaypoint ? 'rgba(96,165,250,0.3)' : 'var(--border)'}`,
            }}
          >
            {isAddingWaypoint ? 'Adding waypoints...' : '+ Add Waypoint'}
          </button>
        </div>

        {/* Settings */}
        <div
          className="rounded-lg p-2 space-y-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Settings
          </span>
          <div className="flex items-center justify-between">
            <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Flag spacing
            </label>
            <input
              type="number"
              min={5}
              max={12}
              value={config.flagStep}
              onChange={(e) => onConfigChange({ flagStep: Number(e.target.value) || 8 })}
              className="w-12 px-1.5 py-0.5 rounded text-[10px] text-center bg-transparent border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Max deviation
            </label>
            <input
              type="number"
              min={0}
              max={8}
              value={config.maxDeviation}
              onChange={(e) => onConfigChange({ maxDeviation: Number(e.target.value) || 0 })}
              className="w-12 px-1.5 py-0.5 rounded text-[10px] text-center bg-transparent border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>

        {/* Calculate button */}
        <button
          onClick={onCalculate}
          disabled={waypoints.length < 2 || calculating}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
          style={{
            backgroundColor: 'rgba(6,182,212,0.15)',
            color: '#06b6d4',
            border: '1px solid rgba(6,182,212,0.3)',
          }}
        >
          {calculating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              Calculating...
            </span>
          ) : waypoints.length < 2 ? (
            'Need at least 2 waypoints'
          ) : (
            'Calculate Optimal Path'
          )}
        </button>

        {/* Results */}
        {result && flags.length > 0 && (
          <>
            <div
              className="rounded-lg p-2.5"
              style={{ backgroundColor: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  RSS Income
                </span>
                <span className="text-sm font-bold" style={{ color: '#fbbf24' }}>
                  +{result.totalRssPerHour.toLocaleString()}/h
                </span>
              </div>

              <div className="space-y-1">
                {RSS_TYPE_ORDER.map((type) => {
                  const data = result.rssBreakdown[type];
                  if (data.count === 0) return null;
                  return (
                    <div key={type} className="flex items-center gap-2 text-[10px]">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: RSS_TYPE_COLORS[type] }}
                      />
                      <span style={{ color: 'var(--foreground)' }}>{RSS_TYPE_LABELS[type]}</span>
                      <span style={{ color: 'var(--text-muted)' }}>&times;{data.count}</span>
                      <span className="ml-auto" style={{ color: '#fbbf24' }}>
                        +{data.rssPerHour.toLocaleString()}/h
                      </span>
                    </div>
                  );
                })}
              </div>

              <div
                className="flex items-center gap-3 mt-2 pt-2 text-[10px]"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span style={{ color: 'var(--text-muted)' }}>
                  {flags.length} flags
                </span>
                {plannedCount > 0 && (
                  <span style={{ color: '#06b6d4' }}>{plannedCount} planned</span>
                )}
                {existingCount > 0 && (
                  <span style={{ color: '#22c55e' }}>{existingCount} existing</span>
                )}
                <span style={{ color: 'var(--text-muted)' }}>
                  {result.coveredNodes.size} nodes
                </span>
              </div>
            </div>

            {/* Flag list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Flags
                </span>
              </div>
              <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
                {flags.map((flag, i) => (
                  <div
                    key={flag.id}
                    onClick={() => onSelectFlag(flag.id === selectedFlagId ? null : flag.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-all"
                    style={{
                      backgroundColor:
                        flag.id === selectedFlagId
                          ? 'rgba(6,182,212,0.1)'
                          : 'rgba(255,255,255,0.02)',
                      border:
                        flag.id === selectedFlagId
                          ? '1px solid rgba(6,182,212,0.3)'
                          : '1px solid transparent',
                    }}
                  >
                    <span className="text-[10px] w-4 shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {i + 1}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      ({flag.x},{flag.y})
                    </span>
                    <select
                      value={flag.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        onFlagStatusChange(flag.id, e.target.value as PlannedFlagStatus);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto text-[10px] bg-transparent border rounded px-1 py-0.5"
                      style={{
                        borderColor: 'var(--border)',
                        color: flag.status === 'existing' ? '#22c55e' : '#06b6d4',
                      }}
                    >
                      <option value="planned" style={{ backgroundColor: '#1a1a2e', color: '#06b6d4' }}>
                        Planned
                      </option>
                      <option value="existing" style={{ backgroundColor: '#1a1a2e', color: '#22c55e' }}>
                        Existing
                      </option>
                    </select>
                    {flag.rssPerHour > 0 && (
                      <span className="text-[9px] shrink-0" style={{ color: '#fbbf24' }}>
                        +{flag.rssPerHour.toLocaleString()}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFlagDelete(flag.id);
                      }}
                      className="text-[10px] px-0.5 hover:opacity-80 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {/* Manual add flag */}
              <button
                onClick={onToggleAddFlag}
                className="w-full mt-1.5 px-2 py-1 rounded text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: isAddingFlag ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                  color: isAddingFlag ? '#06b6d4' : 'var(--text-muted)',
                  border: `1px solid ${isAddingFlag ? 'rgba(6,182,212,0.3)' : 'var(--border)'}`,
                }}
              >
                {isAddingFlag ? 'Click map to place flag...' : '+ Add Flag Manually'}
              </button>
            </div>

            {/* Apply to Map */}
            {onApply && plannedCount > 0 && (
              <div
                className="rounded-lg p-2.5 space-y-2"
                style={{ backgroundColor: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Apply to Map
                </span>
                {alliances && alliances.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>Alliance</label>
                    <select
                      value={applyAllianceId || ''}
                      onChange={(e) => setApplyAllianceId(e.target.value || null)}
                      className="flex-1 bg-transparent border rounded px-1.5 py-0.5 text-[10px]"
                      style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    >
                      <option value="" style={{ backgroundColor: '#1a1a2e', color: '#9ca3af' }}>None</option>
                      {alliances.map((a) => (
                        <option key={a.id} value={a.id} style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>
                          [{a.tag}] {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={async () => {
                    setApplying(true);
                    try { await onApply(applyAllianceId); } finally { setApplying(false); }
                  }}
                  disabled={applying}
                  className="w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                  style={{
                    backgroundColor: 'rgba(34,197,94,0.15)',
                    color: '#22c55e',
                    border: '1px solid rgba(34,197,94,0.3)',
                  }}
                >
                  {applying ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      Applying...
                    </span>
                  ) : (
                    `Apply ${plannedCount} flag${plannedCount !== 1 ? 's' : ''} to map`
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
