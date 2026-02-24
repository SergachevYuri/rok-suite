'use client';

import { useMemo } from 'react';
import { Check, X, Trash2, Download, GripVertical, Undo2, RotateCw, Play, Eraser } from 'lucide-react';
import type { RssNode, RssNodeType, RssNodeStatus, RssAnnotationMode } from '@/lib/kvk-map/rss-review';
import { RSS_TYPES, RSS_TYPE_COLORS, RSS_TYPE_LABELS } from '@/lib/kvk-map/rss-review';

interface RssReviewPanelProps {
  nodes: RssNode[];
  selectedId: number | null;
  typeFilter: RssNodeType | 'all';
  statusFilter: RssNodeStatus | 'all';
  onTypeFilterChange: (filter: RssNodeType | 'all') => void;
  onStatusFilterChange: (filter: RssNodeStatus | 'all') => void;
  onChangeType: (id: number, type: RssNodeType) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (id: number) => void;
  onSelect: (id: number | null) => void;
  onExport: () => void;
  onClose: () => void;
  // Annotation props
  annotationMode: RssAnnotationMode;
  onAnnotationModeChange: (mode: RssAnnotationMode) => void;
  activeRssType: RssNodeType;
  onActiveRssTypeChange: (type: RssNodeType) => void;
  sourceCount: number;
  propagatedCount: number;
  canUndo: boolean;
  onPropagate: () => void;
  onClearPropagated: () => void;
  onStartFresh: () => void;
  onUndo: () => void;
  onLoadExisting: () => void;
}

export default function RssReviewPanel({
  nodes,
  selectedId,
  typeFilter,
  statusFilter,
  onTypeFilterChange,
  onStatusFilterChange,
  onChangeType,
  onApprove,
  onReject,
  onDelete,
  onSelect,
  onExport,
  onClose,
  annotationMode,
  onAnnotationModeChange,
  activeRssType,
  onActiveRssTypeChange,
  sourceCount,
  propagatedCount,
  canUndo,
  onPropagate,
  onClearPropagated,
  onStartFresh,
  onUndo,
  onLoadExisting,
}: RssReviewPanelProps) {
  const stats = useMemo(() => {
    const s = { total: nodes.length, approved: 0, rejected: 0, pending: 0 };
    for (const n of nodes) {
      s[n.status]++;
    }
    return s;
  }, [nodes]);

  const selectedNode = selectedId != null ? nodes.find((n) => n.id === selectedId) : null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          RSS Nodes
        </span>
        <button onClick={onClose} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
          <X size={14} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="px-3 py-2 flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['annotate', 'review'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onAnnotationModeChange(mode)}
            className="flex-1 px-2 py-1.5 rounded text-[11px] font-medium capitalize transition-colors"
            style={{
              backgroundColor: annotationMode === mode ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: annotationMode === mode ? '#3b82f6' : 'var(--text-muted)',
              border: annotationMode === mode ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Annotate mode UI */}
      {annotationMode === 'annotate' && (
        <>
          {/* Active type selector */}
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Click map to place
            </div>
            <div className="flex gap-1 flex-wrap">
              {RSS_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => onActiveRssTypeChange(t)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: activeRssType === t ? `${RSS_TYPE_COLORS[t]}20` : 'var(--background-hover)',
                    color: activeRssType === t ? RSS_TYPE_COLORS[t] : 'var(--text-muted)',
                    outline: activeRssType === t ? `1.5px solid ${RSS_TYPE_COLORS[t]}` : 'none',
                  }}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[t] }} />
                  {RSS_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex gap-3 text-[10px] font-medium">
              <span style={{ color: '#3b82f6' }}>{sourceCount} source</span>
              <span style={{ color: 'var(--text-muted)' }}>{propagatedCount} propagated</span>
              <span className="ml-auto" style={{ color: 'var(--foreground)' }}>{nodes.length} total</span>
            </div>
          </div>

          {/* Selected node (in annotate mode) */}
          {selectedNode && (
            <div className="px-3 py-2 border-b space-y-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[selectedNode.type] }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                  Node #{selectedNode.id}
                </span>
                {selectedNode.source === 'propagated' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                    propagated
                  </span>
                )}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                ({selectedNode.x}, {selectedNode.y})
                {selectedNode.source === 'manual' && <span> · drag to move</span>}
              </div>
              <div className="flex gap-1">
                {RSS_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => onChangeType(selectedNode.id, t)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: selectedNode.type === t ? `${RSS_TYPE_COLORS[t]}20` : 'var(--background-hover)',
                      color: selectedNode.type === t ? RSS_TYPE_COLORS[t] : 'var(--text-muted)',
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[t] }} />
                    {RSS_TYPE_LABELS[t]}
                  </button>
                ))}
                <button
                  onClick={() => { onDelete(selectedNode.id); onSelect(null); }}
                  className="ml-auto flex items-center px-1.5 py-0.5 rounded text-[10px]"
                  style={{ backgroundColor: 'var(--background-hover)', color: '#ef4444' }}
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="px-3 py-2 space-y-1.5">
            <button
              onClick={onPropagate}
              disabled={sourceCount === 0}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
            >
              <RotateCw size={12} /> Propagate to All Segments
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium disabled:opacity-30"
                style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
              >
                <Undo2 size={10} /> Undo
              </button>
              {propagatedCount > 0 && (
                <button
                  onClick={onClearPropagated}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: 'rgba(234,179,8,0.1)', color: '#eab308' }}
                >
                  <Eraser size={10} /> Clear propagated
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={onLoadExisting}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
              >
                <Play size={10} /> Load existing
              </button>
              <button
                onClick={onStartFresh}
                disabled={nodes.length === 0}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium disabled:opacity-30"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              >
                <Trash2 size={10} /> Start fresh
              </button>
            </div>
          </div>

          {/* Export */}
          <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={onExport}
              disabled={nodes.length === 0}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30"
              style={{ backgroundColor: 'var(--background-hover)', color: 'var(--foreground)' }}
            >
              <Download size={12} /> Export nodes
            </button>
          </div>
        </>
      )}

      {/* Review mode UI (original) */}
      {annotationMode === 'review' && (
        <>
          {/* Stats */}
          <div className="px-3 py-2 flex gap-3 text-[10px] font-medium border-b" style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: '#22c55e' }}>{stats.approved} approved</span>
            <span style={{ color: '#ef4444' }}>{stats.rejected} rejected</span>
            <span style={{ color: 'var(--text-muted)' }}>{stats.pending} pending</span>
            <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{stats.total} total</span>
          </div>

          {/* Type filter */}
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Type</div>
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => onTypeFilterChange('all')}
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: typeFilter === 'all' ? 'var(--background-hover)' : 'transparent',
                  color: typeFilter === 'all' ? 'var(--foreground)' : 'var(--text-muted)',
                }}
              >
                All
              </button>
              {RSS_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => onTypeFilterChange(t)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: typeFilter === t ? `${RSS_TYPE_COLORS[t]}20` : 'transparent',
                    color: typeFilter === t ? RSS_TYPE_COLORS[t] : 'var(--text-muted)',
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[t] }} />
                  {RSS_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Status</div>
            <div className="flex gap-1">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onStatusFilterChange(s)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium capitalize"
                  style={{
                    backgroundColor: statusFilter === s ? 'var(--background-hover)' : 'transparent',
                    color: statusFilter === s ? 'var(--foreground)' : 'var(--text-muted)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Selected node details */}
          {selectedNode ? (
            <div className="px-3 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[selectedNode.type] }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  Node #{selectedNode.id}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ml-auto"
                  style={{
                    backgroundColor: selectedNode.status === 'approved' ? 'rgba(34,197,94,0.15)' :
                      selectedNode.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'var(--background-hover)',
                    color: selectedNode.status === 'approved' ? '#22c55e' :
                      selectedNode.status === 'rejected' ? '#ef4444' : 'var(--text-muted)',
                  }}
                >
                  {selectedNode.status}
                </span>
              </div>

              {/* Coordinates */}
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Position: <span style={{ color: 'var(--foreground)' }}>X: {selectedNode.x}, Y: {selectedNode.y}</span>
                {selectedNode.source === 'propagated' && (
                  <span style={{ color: '#8b5cf6' }}> (propagated)</span>
                )}
              </div>

              {/* Drag hint */}
              <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <GripVertical size={10} /> Drag the marker to reposition
              </div>

              {/* Type selector */}
              <div>
                <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Change type</div>
                <div className="flex gap-1">
                  {RSS_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => onChangeType(selectedNode.id, t)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: selectedNode.type === t ? `${RSS_TYPE_COLORS[t]}20` : 'var(--background-hover)',
                        color: selectedNode.type === t ? RSS_TYPE_COLORS[t] : 'var(--text-muted)',
                        outline: selectedNode.type === t ? `1px solid ${RSS_TYPE_COLORS[t]}` : 'none',
                      }}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[t] }} />
                      {RSS_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={() => onApprove(selectedNode.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: selectedNode.status === 'approved' ? 'rgba(34,197,94,0.15)' : 'var(--background-hover)',
                    color: '#22c55e',
                  }}
                >
                  <Check size={12} /> Approve
                </button>
                <button
                  onClick={() => onReject(selectedNode.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: selectedNode.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'var(--background-hover)',
                    color: '#ef4444',
                  }}
                >
                  <X size={12} /> Reject
                </button>
                <button
                  onClick={() => { onDelete(selectedNode.id); onSelect(null); }}
                  className="flex items-center justify-center px-2 py-1.5 rounded text-xs"
                  style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
                  title="Delete permanently"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              Click a node on the map to review it
            </div>
          )}

          {/* Export */}
          <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={onExport}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: 'var(--background-hover)', color: 'var(--foreground)' }}
            >
              <Download size={12} /> Export corrected nodes
            </button>
          </div>
        </>
      )}
    </div>
  );
}
