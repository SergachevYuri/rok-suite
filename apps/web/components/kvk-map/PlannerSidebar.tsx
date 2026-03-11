'use client';

import { useState } from 'react';
import { Eye, EyeOff, ChevronDown, ChevronRight, Flag, Swords, Users, Layers } from 'lucide-react';
import { FEATURE_GROUPS } from '@/lib/kvk-feature-config';
import type { KvkAlliance, AllianceRole } from '@/lib/kvk-map-types';
import AllianceList from './AllianceList';

interface PlannerSidebarProps {
  // Alliance list
  alliances: KvkAlliance[];
  highlightedAllianceId: string | null;
  onHighlight: (id: string | null) => void;
  onCreateAlliance: (data: { tag: string; name: string; role: AllianceRole; color: string }) => void;
  onUpdateAlliance: (id: string, updates: Partial<KvkAlliance>) => void;
  onDeleteAlliance: (id: string) => void;

  // Layer visibility
  featureCounts: Record<string, number>;
  hiddenGroups: Set<string>;
  onToggleGroup: (groupKey: string) => void;

  // Flag/fortress placement
  onPlaceFlag: () => void;
  isPlacingFlag: boolean;
  onPlaceFortress: () => void;
  isPlacingFortress: boolean;

  // Flag path
  flagPathActive: boolean;
  flagCount: number;
  onToggleFlagPath: () => void;

  // War plan
  warPlanActive: boolean;
  onToggleWarPlan: () => void;

  // Admin tools
  isAdmin: boolean;
  adminContent?: React.ReactNode;
}

export default function PlannerSidebar({
  alliances,
  highlightedAllianceId,
  onHighlight,
  onCreateAlliance,
  onUpdateAlliance,
  onDeleteAlliance,
  featureCounts,
  hiddenGroups,
  onToggleGroup,
  onPlaceFlag,
  isPlacingFlag,
  onPlaceFortress,
  isPlacingFortress,
  flagPathActive,
  flagCount,
  onToggleFlagPath,
  warPlanActive,
  onToggleWarPlan,
  isAdmin,
  adminContent,
}: PlannerSidebarProps) {
  const [alliancesOpen, setAlliancesOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const totalFeatures = Object.values(featureCounts).reduce((s, n) => s + n, 0);
  const hiddenCount = hiddenGroups.size;

  return (
    <div className="space-y-2">
      {/* War Plan toggle — prominent, always visible */}
      <button
        onClick={onToggleWarPlan}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all"
        style={{
          backgroundColor: warPlanActive ? 'rgba(239,68,68,0.15)' : 'var(--background-card)',
          color: warPlanActive ? '#ef4444' : 'var(--text-muted)',
          border: `1px solid ${warPlanActive ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
        }}
      >
        <Swords size={14} />
        War Plan
        {warPlanActive && (
          <span className="ml-auto text-[10px] font-normal opacity-70">Active</span>
        )}
      </button>

      {/* Place Fortress / Flag — always visible */}
      <div className="flex gap-2">
        <button
          onClick={onPlaceFortress}
          className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: isPlacingFortress ? 'rgba(71,85,105,0.2)' : 'var(--background-card)',
            color: isPlacingFortress ? '#94a3b8' : 'var(--text-muted)',
            border: `1px solid ${isPlacingFortress ? 'rgba(71,85,105,0.4)' : 'var(--border)'}`,
          }}
        >
          <Flag size={13} />
          {isPlacingFortress ? 'Placing...' : 'Fortress'}
        </button>
        <button
          onClick={onPlaceFlag}
          className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: isPlacingFlag ? 'rgba(100,116,139,0.2)' : 'var(--background-card)',
            color: isPlacingFlag ? '#94a3b8' : 'var(--text-muted)',
            border: `1px solid ${isPlacingFlag ? 'rgba(100,116,139,0.4)' : 'var(--border)'}`,
          }}
        >
          <Flag size={13} />
          {isPlacingFlag ? 'Placing...' : 'Flag'}
        </button>
      </div>

      {/* Flag Path Planner toggle — always visible */}
      <button
        onClick={onToggleFlagPath}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
        style={{
          backgroundColor: flagPathActive ? 'rgba(6,182,212,0.15)' : 'var(--background-card)',
          color: flagPathActive ? '#06b6d4' : 'var(--text-muted)',
          border: `1px solid ${flagPathActive ? 'rgba(6,182,212,0.3)' : 'var(--border)'}`,
        }}
      >
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: flagPathActive ? '#06b6d4' : 'var(--text-muted)' }} />
        Plan Flag Path
        {flagPathActive && flagCount > 0 && (
          <span className="ml-auto text-[10px]">{flagCount} flags</span>
        )}
      </button>

      {/* Alliances — collapsible, starts closed */}
      <div className="rounded-xl border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
        <button
          onClick={() => setAlliancesOpen(!alliancesOpen)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {alliancesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Users size={12} />
          Alliances
          {alliances.length > 0 && (
            <span className="ml-auto text-[10px] tabular-nums font-normal">{alliances.length}</span>
          )}
        </button>
        {alliancesOpen && (
          <div className="px-1 pb-2">
            <AllianceList
              alliances={alliances}
              highlightedAllianceId={highlightedAllianceId}
              onHighlight={onHighlight}
              onCreate={onCreateAlliance}
              onUpdate={onUpdateAlliance}
              onDelete={onDeleteAlliance}
            />
          </div>
        )}
      </div>

      {/* Layers — collapsible, starts closed */}
      <div className="rounded-xl border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
        <button
          onClick={() => setLayersOpen(!layersOpen)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {layersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Layers size={12} />
          Layers
          {totalFeatures > 0 && (
            <span className="ml-auto text-[10px] tabular-nums font-normal">
              {hiddenCount > 0 ? `${hiddenCount} hidden` : totalFeatures}
            </span>
          )}
        </button>
        {layersOpen && (
          <div className="px-1 pb-2 space-y-0.5">
            {FEATURE_GROUPS.map((group) => {
              const count = group.types.reduce((s, t) => s + (featureCounts[t] || 0), 0);
              const hidden = hiddenGroups.has(group.key);
              return (
                <button
                  key={group.key}
                  onClick={() => onToggleGroup(group.key)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all"
                  style={{ opacity: hidden ? 0.4 : 1 }}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                  <span className="flex-1 text-left" style={{ color: 'var(--foreground)' }}>{group.label}</span>
                  {count > 0 && (
                    <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{count}</span>
                  )}
                  {hidden ? (
                    <EyeOff size={12} style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <Eye size={12} style={{ color: 'var(--text-muted)' }} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin Tools (collapsible) */}
      {isAdmin && adminContent && (
        <div className="rounded-xl border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {adminOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Admin Tools
          </button>
          {adminOpen && (
            <div className="px-1 pb-2">
              {adminContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
