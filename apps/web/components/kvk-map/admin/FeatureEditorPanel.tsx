'use client';

import { useState, useEffect } from 'react';
import { Trash2, X, Save } from 'lucide-react';
import type { KvkMapFeature } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG, ZONE_OPTIONS } from '@/lib/kvk-feature-config';

interface FeatureEditorPanelProps {
  feature: KvkMapFeature;
  onSave: (featureId: string, updates: Partial<KvkMapFeature>) => void;
  onDelete: (featureId: string) => void;
  onClose: () => void;
}

export default function FeatureEditorPanel({
  feature,
  onSave,
  onDelete,
  onClose,
}: FeatureEditorPanelProps) {
  const [zone, setZone] = useState(feature.zone?.toString() || '');
  const [level, setLevel] = useState(feature.level?.toString() || '');

  // Reset form when feature changes
  useEffect(() => {
    setZone(feature.zone?.toString() || '');
    setLevel(feature.level?.toString() || '');
  }, [feature.id, feature.zone, feature.level]);

  const config = FEATURE_TYPE_CONFIG[feature.feature_type];

  const handleSave = () => {
    onSave(feature.id, {
      zone: zone ? parseInt(zone, 10) : null,
      level: level ? parseInt(level, 10) : null,
    });
  };

  const handleDelete = () => {
    if (window.confirm('Delete this feature?')) {
      onDelete(feature.id);
    }
  };

  const inputClass =
    'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50';
  const inputStyle = {
    backgroundColor: 'var(--background-secondary)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  };

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--background-card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: config?.color }}
          >
            {config?.abbreviation}
          </div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--foreground)' }}
          >
            {config?.label || feature.feature_type}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--background-hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Form */}
      <div className="space-y-3">
        {(config?.buffs.length > 0 || config?.kingdomHonor || config?.allianceHonor) && (
          <div
            className="rounded-md p-2.5 text-xs space-y-1"
            style={{ backgroundColor: 'var(--background-secondary)' }}
          >
            {config.buffs.map((buff, i) => (
              <div key={i} style={{ color: config.color }}>{buff}</div>
            ))}
            {config.kingdomHonor && (
              <div style={{ color: 'var(--text-muted)' }}>Kingdom Honor {config.kingdomHonor}</div>
            )}
            {config.allianceHonor && (
              <div style={{ color: 'var(--text-muted)' }}>Alliance Honor {config.allianceHonor}</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Zone
            </label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">None</option>
              {ZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Level
            </label>
            <input
              type="number"
              min="1"
              max="8"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="1-8"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        {config?.firstTimeRewards.length > 0 && (
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              First Occupation (per player)
            </label>
            <div
              className="rounded-md p-2.5 text-xs space-y-0.5"
              style={{ backgroundColor: 'var(--background-secondary)' }}
            >
              {config.firstTimeRewards.map((reward, i) => (
                <div key={i} style={{ color: '#d4d4d8' }}>{reward}</div>
              ))}
            </div>
          </div>
        )}

        {/* Coordinates (read-only) */}
        <div
          className="text-xs font-mono"
          style={{ color: 'var(--text-muted)' }}
        >
          Position: ({Math.round(feature.x)}, {Math.round(feature.y)})
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex items-center justify-between mt-4 pt-3 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 size={14} />
          Delete
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
        >
          <Save size={14} />
          Save
        </button>
      </div>
    </div>
  );
}
