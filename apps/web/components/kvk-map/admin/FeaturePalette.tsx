'use client';

import type { FeatureType } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG, FEATURE_GROUPS, FEATURE_TYPE_TO_GROUP } from '@/lib/kvk-feature-config';
import { MousePointer, Eye, EyeOff } from 'lucide-react';

interface FeaturePaletteProps {
  selectedType: FeatureType | null;
  isPlacing: boolean;
  onSelectType: (type: FeatureType) => void;
  onCancelPlacement: () => void;
  featureCounts: Record<string, number>;
  hiddenGroups: Set<string>;
  onToggleGroup: (groupKey: string) => void;
  allHidden: boolean;
  onToggleAll: () => void;
  readOnly?: boolean;
  /** Group keys that are editable even when readOnly is true (e.g. officers can place flags). */
  editableGroupKeys?: Set<string>;
}

export default function FeaturePalette({
  selectedType,
  isPlacing,
  onSelectType,
  onCancelPlacement,
  featureCounts,
  hiddenGroups,
  onToggleGroup,
  allHidden,
  onToggleAll,
  readOnly = false,
  editableGroupKeys,
}: FeaturePaletteProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--background-card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Select tool + Hide All */}
      <div className="flex gap-1.5 mb-3">
        {(!readOnly || (editableGroupKeys && editableGroupKeys.size > 0)) && (
          <button
            onClick={onCancelPlacement}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: !isPlacing ? 'var(--background-hover)' : 'transparent',
              color: 'var(--foreground)',
              outline: !isPlacing ? '2px solid rgba(255,255,255,0.2)' : 'none',
              outlineOffset: '-2px',
            }}
          >
            <MousePointer size={16} />
            Select
          </button>
        )}
        <button
          onClick={onToggleAll}
          className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: allHidden ? 'var(--background-hover)' : 'transparent',
            color: 'var(--text-muted)',
          }}
          title={allHidden ? 'Show all layers' : 'Hide all layers'}
        >
          {allHidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>

      {/* Zones toggle */}
      <div className="mb-1">
        <button
          onClick={() => onToggleGroup('zones')}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all"
          style={{ color: hiddenGroups.has('zones') ? 'var(--text-muted)' : '#3b82f6' }}
        >
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: '#3b82f6', opacity: hiddenGroups.has('zones') ? 0.3 : 1 }}
          />
          <span className="flex-1 text-left">Zones</span>
          {hiddenGroups.has('zones') ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* Feature groups */}
      {FEATURE_GROUPS.map((group) => {
        const isHidden = hiddenGroups.has(group.key);
        const groupCount = group.types.reduce((sum, t) => sum + (featureCounts[t] || 0), 0);

        return (
          <div key={group.key} className="mb-1">
            {/* Group header with toggle */}
            <button
              onClick={() => onToggleGroup(group.key)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all"
              style={{ color: isHidden ? 'var(--text-muted)' : group.color }}
            >
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: group.color, opacity: isHidden ? 0.3 : 1 }}
              />
              <span className="flex-1 text-left">{group.label}</span>
              {groupCount > 0 && (
                <span
                  className="text-[10px] px-1 rounded"
                  style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
                >
                  {groupCount}
                </span>
              )}
              {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>

            {/* Feature type buttons */}
            {!isHidden && (!readOnly || editableGroupKeys?.has(group.key)) && (
              <div className="ml-2 space-y-0.5 mt-0.5">
                {group.types.map((type) => {
                  const config = FEATURE_TYPE_CONFIG[type];
                  const isActive = isPlacing && selectedType === type;
                  const count = featureCounts[type] || 0;

                  return (
                    <button
                      key={type}
                      onClick={() => onSelectType(type)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        backgroundColor: isActive ? `${config.color}20` : 'transparent',
                        color: isActive ? config.color : 'var(--text-secondary)',
                        outline: isActive ? `2px solid ${config.color}` : 'none',
                        outlineOffset: '-2px',
                      }}
                      title={config.description}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: config.color,
                          fontSize: '9px',
                          fontWeight: 700,
                          color: 'white',
                        }}
                      >
                        {config.abbreviation.charAt(0)}
                      </div>
                      <span className="flex-1 text-left text-xs">{config.label}</span>
                      {count > 0 && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'var(--background-hover)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Placement hint */}
      {(!readOnly || editableGroupKeys?.has(FEATURE_TYPE_TO_GROUP[selectedType!])) && isPlacing && selectedType && (
        <div
          className="mt-3 px-3 py-2 rounded-lg text-xs"
          style={{
            backgroundColor: `${FEATURE_TYPE_CONFIG[selectedType].color}15`,
            color: FEATURE_TYPE_CONFIG[selectedType].color,
          }}
        >
          Click on the map to place a {FEATURE_TYPE_CONFIG[selectedType].label}
        </div>
      )}
    </div>
  );
}
