'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Flag, X } from 'lucide-react';
import { isPointInPolygon } from '@/lib/kvk-map/point-in-zone';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';
import { RSS_EARNINGS_PER_HOUR } from '@/lib/kvk-map/flag-path';
import { RSS_TYPE_COLORS, RSS_TYPE_LABELS, type RssNode, type RssNodeType } from '@/lib/kvk-map/rss-review';
import type { KvkMapZone, KvkMapFeature, KvkAssignment, KvkAlliance, FeatureType } from '@/lib/kvk-map-types';

function isFlagFeature(type: string): boolean {
  return !!FEATURE_TYPE_CONFIG[type as keyof typeof FEATURE_TYPE_CONFIG]?.tileSize;
}

const RSS_TYPE_ORDER: RssNodeType[] = ['food', 'wood', 'stone', 'gold', 'crystal'];

interface ZonePlanPanelProps {
  zone: KvkMapZone;
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
  rssNodes: RssNode[];
  onPlaceFortress?: () => void;
  onPlaceFlag?: () => void;
  isPlacingFortress: boolean;
  isPlacingFlag: boolean;
  onSelectFeature: (id: string) => void;
  onClearFocus: () => void;
  onUpdateKingdom?: (kingdom: string | null) => void;
}

function KingdomInput({ kingdom, onUpdate }: { kingdom: string | null; onUpdate: (k: string | null) => void }) {
  const [value, setValue] = useState(kingdom || '');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync from prop when zone changes
  useEffect(() => { setValue(kingdom || ''); }, [kingdom]);

  const handleChange = (v: string) => {
    setValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate(v || null), 500);
  };

  return (
    <input
      type="text"
      placeholder="K#"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => { clearTimeout(timerRef.current); onUpdate(value || null); }}
      className="w-14 text-[11px] font-bold px-1.5 py-0.5 rounded border bg-transparent text-center"
      style={{
        borderColor: 'var(--border)',
        color: value ? 'rgba(255,200,50,0.9)' : 'var(--text-muted)',
      }}
    />
  );
}

export default function ZonePlanPanel({
  zone,
  features,
  assignments,
  alliances,
  rssNodes,
  onPlaceFortress,
  onPlaceFlag,
  isPlacingFortress,
  isPlacingFlag,
  onSelectFeature,
  onClearFocus,
  onUpdateKingdom,
}: ZonePlanPanelProps) {
  const assignmentMap = useMemo(
    () => new Map(assignments.map((a) => [a.feature_id, a])),
    [assignments],
  );
  const allianceMap = useMemo(
    () => new Map(alliances.map((a) => [a.id, a])),
    [alliances],
  );

  // Features inside this zone
  const zoneFeatures = useMemo(
    () => features.filter((f) => isPointInPolygon(f.x, f.y, zone.polygon)),
    [features, zone.polygon],
  );

  // Split into forts/flags vs buildings
  const { forts, buildings } = useMemo(() => {
    const f: KvkMapFeature[] = [];
    const b: KvkMapFeature[] = [];
    for (const feat of zoneFeatures) {
      if (isFlagFeature(feat.feature_type)) {
        f.push(feat);
      } else {
        b.push(feat);
      }
    }
    return { forts: f, buildings: b };
  }, [zoneFeatures]);

  // Per-alliance flag & fort counts with status breakdown
  const allianceFlagSummary = useMemo(() => {
    const summary = new Map<string, { alliance: KvkAlliance | null; flagsOccupied: number; flagsPlanned: number; fortsOccupied: number; fortsPlanned: number }>();
    for (const feat of forts) {
      const assignment = assignmentMap.get(feat.id);
      const alliance = assignment ? allianceMap.get(assignment.alliance_id) ?? null : null;
      const key = alliance?.id ?? '__unassigned';
      if (!summary.has(key)) summary.set(key, { alliance, flagsOccupied: 0, flagsPlanned: 0, fortsOccupied: 0, fortsPlanned: 0 });
      const entry = summary.get(key)!;
      const isFort = feat.feature_type === 'fortress';
      const isOccupied = assignment?.status === 'occupied';
      if (isFort) {
        if (isOccupied) entry.fortsOccupied++;
        else entry.fortsPlanned++;
      } else {
        if (isOccupied) entry.flagsOccupied++;
        else entry.flagsPlanned++;
      }
    }
    // Sort: alliances by sort_order, unassigned last
    return [...summary.values()].sort((a, b) => {
      if (!a.alliance) return 1;
      if (!b.alliance) return -1;
      return (a.alliance.sort_order ?? 0) - (b.alliance.sort_order ?? 0);
    });
  }, [forts, assignmentMap, allianceMap]);

  // Building count by type
  const buildingSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of buildings) {
      const cfg = FEATURE_TYPE_CONFIG[b.feature_type as keyof typeof FEATURE_TYPE_CONFIG];
      const label = cfg?.label || b.feature_type;
      counts[label] = (counts[label] || 0) + 1;
    }
    return Object.entries(counts);
  }, [buildings]);

  // RSS production for this zone
  const rssProduction = useMemo(() => {
    const approved = rssNodes.filter((n) => n.status === 'approved' && isPointInPolygon(n.x, n.y, zone.polygon));
    const byType: Record<RssNodeType, number> = { food: 0, wood: 0, stone: 0, gold: 0, crystal: 0 };
    for (const n of approved) byType[n.type]++;
    const entries = RSS_TYPE_ORDER
      .filter((t) => byType[t] > 0)
      .map((t) => ({ type: t, count: byType[t], rssPerHour: byType[t] * RSS_EARNINGS_PER_HOUR[t] }));
    const total = entries.reduce((sum, e) => sum + e.rssPerHour, 0);
    return { entries, total };
  }, [rssNodes, zone.polygon]);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: zone.color }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {zone.name || `Zone ${zone.zone_number}`}
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
            Zone {zone.zone_number}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onUpdateKingdom ? (
            <KingdomInput kingdom={zone.kingdom} onUpdate={onUpdateKingdom} />
          ) : zone.kingdom ? (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,200,50,0.15)', color: 'rgba(255,200,50,0.9)' }}>
              K{zone.kingdom}
            </span>
          ) : null}
          <button onClick={onClearFocus} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Fort Drops */}
      <div className="p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Fort Drops
        </p>

        {forts.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            {onPlaceFortress ? 'Place a fortress for each alliance that will drop here' : 'No forts placed yet'}
          </p>
        ) : (
          <div className="space-y-1">
            {forts.map((fort) => {
              const assignment = assignmentMap.get(fort.id);
              const alliance = assignment ? allianceMap.get(assignment.alliance_id) : null;
              const cfg = FEATURE_TYPE_CONFIG[fort.feature_type as keyof typeof FEATURE_TYPE_CONFIG];
              return (
                <button
                  key={fort.id}
                  onClick={() => onSelectFeature(fort.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all hover:bg-white/5"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: alliance?.color || 'var(--text-muted)' }}
                  />
                  <span className="font-medium" style={{ color: alliance?.color || 'var(--text-muted)' }}>
                    {alliance?.tag || 'Unassigned'}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {cfg?.label || fort.feature_type}
                  </span>
                  {assignment?.assigned_by && (
                    <span className="text-[10px] italic" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                      — {assignment.assigned_by}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] tabular-nums" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                    ({Math.round(fort.x)}, {Math.round(fort.y)})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Placement buttons — officers only */}
        {(onPlaceFortress || onPlaceFlag) && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onPlaceFortress}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            style={{
              backgroundColor: isPlacingFortress ? 'rgba(71,85,105,0.25)' : 'var(--background-hover)',
              color: isPlacingFortress ? '#94a3b8' : 'var(--text-muted)',
              border: `1px solid ${isPlacingFortress ? 'rgba(71,85,105,0.4)' : 'var(--border)'}`,
            }}
          >
            <Flag size={11} />
            {isPlacingFortress ? 'Placing...' : 'Fortress'}
          </button>
          <button
            onClick={onPlaceFlag}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            style={{
              backgroundColor: isPlacingFlag ? 'rgba(100,116,139,0.25)' : 'var(--background-hover)',
              color: isPlacingFlag ? '#94a3b8' : 'var(--text-muted)',
              border: `1px solid ${isPlacingFlag ? 'rgba(100,116,139,0.4)' : 'var(--border)'}`,
            }}
          >
            <Flag size={11} />
            {isPlacingFlag ? 'Placing...' : 'Flag'}
          </button>
        </div>
        )}
      </div>

      {/* Flag & Fort Summary by Alliance */}
      {allianceFlagSummary.length > 0 && (
        <div className="px-3 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Flags &amp; Forts by Alliance
          </p>
          <div className="space-y-1">
            {allianceFlagSummary.map((entry) => {
              const tag = entry.alliance?.tag ?? 'Unassigned';
              const color = entry.alliance?.color ?? 'var(--text-muted)';
              const totalFlags = entry.flagsOccupied + entry.flagsPlanned;
              const totalForts = entry.fortsOccupied + entry.fortsPlanned;
              return (
                <div key={entry.alliance?.id ?? '__unassigned'} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-medium w-10" style={{ color }}>{tag}</span>
                  {totalForts > 0 && (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {totalForts} fort{totalForts !== 1 ? 's' : ''}
                      <span className="text-[10px] ml-0.5" style={{ color: entry.fortsOccupied > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                        ({entry.fortsOccupied}✓)
                      </span>
                    </span>
                  )}
                  {totalFlags > 0 && (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {totalFlags} flag{totalFlags !== 1 ? 's' : ''}
                      <span className="text-[10px] ml-0.5" style={{ color: entry.flagsOccupied > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                        ({entry.flagsOccupied}✓)
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buildings summary */}
      {buildingSummary.length > 0 && (
        <div className="px-3 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Buildings
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {buildingSummary.map(([label, count]) => `${count} ${label}${count > 1 ? 's' : ''}`).join(' · ')}
          </p>
        </div>
      )}

      {/* RSS Production */}
      {rssProduction.total > 0 && (
        <div className="px-3 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            RSS Production
          </p>
          <div className="space-y-1">
            {rssProduction.entries.map((e) => (
              <div key={e.type} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: RSS_TYPE_COLORS[e.type] }} />
                <span style={{ color: 'var(--text-secondary)' }}>{RSS_TYPE_LABELS[e.type]}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>×{e.count}</span>
                <span className="ml-auto tabular-nums font-medium" style={{ color: RSS_TYPE_COLORS[e.type] }}>
                  {e.rssPerHour.toLocaleString()}/hr
                </span>
              </div>
            ))}
          </div>
          <div
            className="flex items-center justify-between mt-2 pt-1.5 border-t text-xs"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Total</span>
            <span className="tabular-nums font-semibold" style={{ color: 'var(--foreground)' }}>
              {rssProduction.total.toLocaleString()}/hr
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
