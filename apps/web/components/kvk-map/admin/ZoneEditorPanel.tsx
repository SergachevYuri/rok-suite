'use client';

import { X, Undo2, Save, Pencil } from 'lucide-react';
import type { KvkMapZone } from '@/lib/kvk-map-types';

interface ZoneEditorPanelProps {
  zone: KvkMapZone;
  isDrawing: boolean;
  vertexCount: number;
  onStartDrawing: () => void;
  onUndoVertex: () => void;
  onFinishDrawing: () => void;
  onCancelDrawing: () => void;
  onClose: () => void;
}

export default function ZoneEditorPanel({
  zone,
  isDrawing,
  vertexCount,
  onStartDrawing,
  onUndoVertex,
  onFinishDrawing,
  onCancelDrawing,
  onClose,
}: ZoneEditorPanelProps) {
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
            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: zone.color, color: 'white' }}
          >
            {zone.zone_number}
          </div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--foreground)' }}
          >
            {zone.name || `Zone ${zone.zone_number}`}
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

      {/* Info */}
      <div
        className="rounded-md p-2.5 text-xs mb-3"
        style={{ backgroundColor: 'var(--background-secondary)' }}
      >
        <div style={{ color: 'var(--text-muted)' }}>
          Current polygon: {zone.polygon.length} vertices
        </div>
        {isDrawing && (
          <div style={{ color: zone.color }} className="mt-1">
            Drawing: {vertexCount} vertices placed
          </div>
        )}
      </div>

      {/* Instructions */}
      {!isDrawing ? (
        <div className="space-y-2 mb-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Click &quot;Redraw&quot; to trace a new polygon boundary for this zone.
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            The new polygon will replace the existing one when you finish.
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Click on the map to add vertices. Double-click or click &quot;Finish&quot; to complete.
          </p>
          <ul className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
            <li>- Minimum 3 vertices required</li>
            <li>- Esc to cancel drawing</li>
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {!isDrawing ? (
          <button
            onClick={onStartDrawing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
          >
            <Pencil size={16} />
            Redraw Polygon
          </button>
        ) : (
          <>
            <button
              onClick={onUndoVertex}
              disabled={vertexCount === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--background-hover)',
                color: 'var(--foreground)',
              }}
            >
              <Undo2 size={16} />
              Undo Last Vertex
            </button>
            <button
              onClick={onFinishDrawing}
              disabled={vertexCount < 3}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              Finish {vertexCount < 3 ? `(need ${3 - vertexCount} more)` : '& Save'}
            </button>
            <button
              onClick={onCancelDrawing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
            >
              <X size={16} />
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
