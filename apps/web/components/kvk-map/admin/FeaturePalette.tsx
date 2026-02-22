'use client';

import type { FeatureType } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG, FEATURE_TYPES_ORDERED } from '@/lib/kvk-feature-config';
import { MousePointer } from 'lucide-react';

interface FeaturePaletteProps {
  selectedType: FeatureType | null;
  isPlacing: boolean;
  onSelectType: (type: FeatureType) => void;
  onCancelPlacement: () => void;
  featureCounts: Record<string, number>;
}

export default function FeaturePalette({
  selectedType,
  isPlacing,
  onSelectType,
  onCancelPlacement,
  featureCounts,
}: FeaturePaletteProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--background-card)',
        borderColor: 'var(--border)',
      }}
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        Features
      </h3>

      {/* Select tool */}
      <button
        onClick={onCancelPlacement}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all mb-2"
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

      {/* Feature type buttons */}
      <div className="space-y-1">
        {FEATURE_TYPES_ORDERED.map((type) => {
          const config = FEATURE_TYPE_CONFIG[type];
          const isActive = isPlacing && selectedType === type;
          const count = featureCounts[type] || 0;

          return (
            <button
              key={type}
              onClick={() => onSelectType(type)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
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
              <span className="flex-1 text-left">{config.label}</span>
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

      {/* Placement hint */}
      {isPlacing && selectedType && (
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
