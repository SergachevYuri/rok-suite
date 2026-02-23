'use client';

import { useMemo } from 'react';
import { Check, X, Trash2, Download, GripVertical } from 'lucide-react';
import type { RssNode, RssNodeType, RssNodeStatus } from '@/lib/kvk-map/rss-review';
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
          RSS Node Review
        </span>
        <button onClick={onClose} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
          <X size={14} />
        </button>
      </div>

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
    </div>
  );
}
