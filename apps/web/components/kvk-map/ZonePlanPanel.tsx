'use client';

import { useMemo } from 'react';
import { Flag, X } from 'lucide-react';
import { isPointInPolygon } from '@/lib/kvk-map/point-in-zone';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';
import type { KvkMapZone, KvkMapFeature, KvkAssignment, KvkAlliance, FeatureType } from '@/lib/kvk-map-types';

function isFlagFeature(type: string): boolean {
  return !!FEATURE_TYPE_CONFIG[type as keyof typeof FEATURE_TYPE_CONFIG]?.tileSize;
}

interface ZonePlanPanelProps {
  zone: KvkMapZone;
  features: KvkMapFeature[];
  assignments: KvkAssignment[];
  alliances: KvkAlliance[];
  onPlaceFortress: () => void;
  onPlaceFlag: () => void;
  isPlacingFortress: boolean;
  isPlacingFlag: boolean;
  onSelectFeature: (id: string) => void;
  onClearFocus: () => void;
}

export default function ZonePlanPanel({
  zone,
  features,
  assignments,
  alliances,
  onPlaceFortress,
  onPlaceFlag,
  isPlacingFortress,
  isPlacingFlag,
  onSelectFeature,
  onClearFocus,
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
        <button onClick={onClearFocus} className="p-1 rounded hover:bg-white/10 transition-colors">
          <X size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Fort Drops */}
      <div className="p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Fort Drops
        </p>

        {forts.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            No forts planned in this zone
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
                  <span className="ml-auto text-[10px] tabular-nums" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                    ({Math.round(fort.x)}, {Math.round(fort.y)})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Placement buttons */}
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
      </div>

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
    </div>
  );
}
