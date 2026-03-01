'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { Check, X, Trash2, Download, GripVertical, Undo2, Play, Eraser, Search, Loader2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
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
  onFlyTo: (x: number, y: number) => void;
  // Annotation props
  annotationMode: RssAnnotationMode;
  onAnnotationModeChange: (mode: RssAnnotationMode) => void;
  activeRssType: RssNodeType;
  onActiveRssTypeChange: (type: RssNodeType) => void;
  sourceCount: number;
  detectedCount: number;
  canUndo: boolean;
  onDetect: () => void;
  detecting: boolean;
  detectProgress: string | null;
  onClearDetected: () => void;
  onStartFresh: () => void;
  onUndo: () => void;
  onLoadExisting: () => void;
  onBatchChangeType: (fromFilter: RssNodeType | 'all', toType: RssNodeType) => void;
  onReclassify: () => void;
  reclassifying: boolean;
  onBulkApprove: (typeFilter: RssNodeType | 'all') => void;
  onBulkReject: (typeFilter: RssNodeType | 'all') => void;
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
  onFlyTo,
  annotationMode,
  onAnnotationModeChange,
  activeRssType,
  onActiveRssTypeChange,
  sourceCount,
  detectedCount,
  canUndo,
  onDetect,
  detecting,
  detectProgress,
  onClearDetected,
  onStartFresh,
  onUndo,
  onLoadExisting,
  onBatchChangeType,
  onReclassify,
  reclassifying,
  onBulkApprove,
  onBulkReject,
}: RssReviewPanelProps) {
  const stats = useMemo(() => {
    const s = { total: nodes.length, approved: 0, rejected: 0, pending: 0 };
    for (const n of nodes) {
      s[n.status]++;
    }
    return s;
  }, [nodes]);

  const selectedNode = selectedId != null ? nodes.find((n) => n.id === selectedId) : null;

  // Sequential review queue: pending detected nodes (filtered by type)
  const reviewQueue = useMemo(() => {
    return nodes.filter(
      (n) => n.source === 'detected' && n.status === 'pending' &&
      (typeFilter === 'all' || n.type === typeFilter)
    );
  }, [nodes, typeFilter]);

  const currentReviewIndex = useMemo(() => {
    if (selectedId == null) return -1;
    return reviewQueue.findIndex((n) => n.id === selectedId);
  }, [reviewQueue, selectedId]);

  const goToReviewNode = useCallback((index: number) => {
    if (index < 0 || index >= reviewQueue.length) return;
    const node = reviewQueue[index];
    onSelect(node.id);
    onFlyTo(node.x, node.y);
  }, [reviewQueue, onSelect, onFlyTo]);

  const handlePrev = useCallback(() => {
    goToReviewNode(currentReviewIndex - 1);
  }, [goToReviewNode, currentReviewIndex]);

  const handleNext = useCallback(() => {
    goToReviewNode(currentReviewIndex + 1);
  }, [goToReviewNode, currentReviewIndex]);

  const handleReviewApprove = useCallback(() => {
    if (selectedId == null) return;
    // Grab next node before state changes
    const nextIndex = currentReviewIndex + 1;
    const nextNode = nextIndex < reviewQueue.length ? reviewQueue[nextIndex] : null;

    onApprove(selectedId);

    if (nextNode) {
      onSelect(nextNode.id);
      onFlyTo(nextNode.x, nextNode.y);
    } else {
      onSelect(null);
    }
  }, [selectedId, currentReviewIndex, reviewQueue, onApprove, onSelect, onFlyTo]);

  const handleReviewReject = useCallback(() => {
    if (selectedId == null) return;
    const nextIndex = currentReviewIndex + 1;
    const nextNode = nextIndex < reviewQueue.length ? reviewQueue[nextIndex] : null;

    onReject(selectedId);

    if (nextNode) {
      onSelect(nextNode.id);
      onFlyTo(nextNode.x, nextNode.y);
    } else {
      onSelect(null);
    }
  }, [selectedId, currentReviewIndex, reviewQueue, onReject, onSelect, onFlyTo]);

  // Keyboard shortcuts for review mode
  useEffect(() => {
    if (annotationMode !== 'review') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
      if ((e.key === 'a' || e.key === 'A') && currentReviewIndex >= 0) { e.preventDefault(); handleReviewApprove(); }
      if ((e.key === 'r' || e.key === 'R') && currentReviewIndex >= 0) { e.preventDefault(); handleReviewReject(); }
      if ((e.key === 'z' || e.key === 'Z') && !e.metaKey && !e.ctrlKey && canUndo) { e.preventDefault(); onUndo(); }
      // 1-5 keys set type during review
      const numKey = parseInt(e.key);
      if (numKey >= 1 && numKey <= 5 && selectedId != null) {
        e.preventDefault();
        onChangeType(selectedId, RSS_TYPES[numKey - 1]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [annotationMode, handlePrev, handleNext, handleReviewApprove, handleReviewReject, currentReviewIndex, selectedId, onChangeType]);

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
              <span style={{ color: '#3b82f6' }}>{sourceCount} manual</span>
              <span style={{ color: '#a855f7' }}>{detectedCount} detected</span>
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
                {selectedNode.source === 'detected' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                    AI detected
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
              onClick={onDetect}
              disabled={sourceCount === 0 || detecting}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
              style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              {detecting ? (
                <><Loader2 size={12} className="animate-spin" /> {detectProgress || 'Detecting...'}</>
              ) : (
                <><Search size={12} /> Auto-detect nodes</>
              )}
            </button>
            {detectProgress && (
              <div className="text-[10px] text-center" style={{ color: detectProgress.startsWith('Error') || detectProgress.includes('failed') ? '#ef4444' : 'var(--text-muted)' }}>
                {detectProgress}
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={onUndo}
                disabled={!canUndo || detecting}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium disabled:opacity-30"
                style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
              >
                <Undo2 size={10} /> Undo
              </button>
              {detectedCount > 0 && (
                <button
                  onClick={onClearDetected}
                  disabled={detecting}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium disabled:opacity-30"
                  style={{ backgroundColor: 'rgba(234,179,8,0.1)', color: '#eab308' }}
                >
                  <Eraser size={10} /> Clear unreviewed
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={onLoadExisting}
                disabled={detecting}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium disabled:opacity-30"
                style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
              >
                <Play size={10} /> Load existing
              </button>
              <button
                onClick={onStartFresh}
                disabled={nodes.length === 0 || detecting}
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

      {/* Review mode UI */}
      {annotationMode === 'review' && (
        <>
          {/* Stats + progress */}
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex gap-3 text-[10px] font-medium mb-1.5">
              <span style={{ color: '#22c55e' }}>{stats.approved} approved</span>
              <span style={{ color: '#ef4444' }}>{stats.rejected} rejected</span>
              <span style={{ color: 'var(--text-muted)' }}>{stats.pending} pending</span>
              <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{stats.total} total</span>
            </div>
            {stats.total > 0 && (
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--background-hover)' }}>
                <div className="h-full flex">
                  <div style={{ width: `${(stats.approved / stats.total) * 100}%`, backgroundColor: '#22c55e' }} />
                  <div style={{ width: `${(stats.rejected / stats.total) * 100}%`, backgroundColor: '#ef4444' }} />
                </div>
              </div>
            )}
            {stats.total > 0 && stats.pending === 0 && (
              <div className="text-[10px] font-medium mt-1 text-center" style={{ color: '#22c55e' }}>
                All nodes reviewed — ready to export!
              </div>
            )}
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

          {/* Batch type change */}
          {reviewQueue.length > 0 && (
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Set all {reviewQueue.length} pending {typeFilter !== 'all' ? RSS_TYPE_LABELS[typeFilter] : ''} →
              </div>
              <div className="flex gap-1 flex-wrap">
                {RSS_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => onBatchChangeType(typeFilter, t)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: `${RSS_TYPE_COLORS[t]}20`,
                      color: RSS_TYPE_COLORS[t],
                    }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[t] }} />
                    {RSS_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Re-classify from corrections */}
          {stats.approved > 0 && reviewQueue.length > 0 && (
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={onReclassify}
                disabled={reclassifying}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
                style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
              >
                {reclassifying ? (
                  <><Loader2 size={12} className="animate-spin" /> Re-classifying...</>
                ) : (
                  <><RefreshCw size={12} /> Re-classify {reviewQueue.length} pending from {stats.approved} corrected</>
                )}
              </button>
            </div>
          )}

          {/* Bulk approve / reject */}
          {reviewQueue.length > 0 && (
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Bulk action — {reviewQueue.length} pending {typeFilter !== 'all' ? RSS_TYPE_LABELS[typeFilter] : ''}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onBulkApprove(typeFilter)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                  style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                >
                  <Check size={12} /> Approve All
                </button>
                <button
                  onClick={() => onBulkReject(typeFilter)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                  style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                >
                  <X size={12} /> Reject All
                </button>
              </div>
            </div>
          )}

          {/* Quick Review controls */}
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Quick Review
              </span>
              <span className="text-[10px] font-medium" style={{ color: '#a855f7' }}>
                {reviewQueue.length} pending
              </span>
            </div>

            {currentReviewIndex >= 0 ? (
              <>
                {/* Progress */}
                <div className="text-xs font-medium mb-2 text-center" style={{ color: 'var(--foreground)' }}>
                  Node {currentReviewIndex + 1} of {reviewQueue.length}
                </div>

                {/* Navigation */}
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={handlePrev}
                    disabled={currentReviewIndex === 0}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium disabled:opacity-30"
                    style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
                  >
                    <ChevronLeft size={10} /> Prev
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={currentReviewIndex >= reviewQueue.length - 1}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium disabled:opacity-30"
                    style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
                  >
                    Next <ChevronRight size={10} />
                  </button>
                </div>

                {/* Type change (quick re-type) */}
                <div className="flex gap-1 mb-2">
                  {RSS_TYPES.map((t) => {
                    const current = selectedNode?.type === t;
                    return (
                      <button
                        key={t}
                        onClick={() => selectedId != null && onChangeType(selectedId, t)}
                        className="flex-1 flex items-center justify-center gap-1 px-1 py-1 rounded text-[9px] font-medium"
                        style={{
                          backgroundColor: current ? `${RSS_TYPE_COLORS[t]}20` : 'var(--background-hover)',
                          color: current ? RSS_TYPE_COLORS[t] : 'var(--text-muted)',
                          outline: current ? `1px solid ${RSS_TYPE_COLORS[t]}` : 'none',
                        }}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[t] }} />
                        {RSS_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>

                {/* Approve / Reject */}
                <div className="flex gap-1.5">
                  <button
                    onClick={handleReviewApprove}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    onClick={handleReviewReject}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                  >
                    <X size={12} /> Reject
                  </button>
                </div>

                {/* Undo */}
                {canUndo && (
                  <button
                    onClick={onUndo}
                    className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium mt-1.5"
                    style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
                  >
                    <Undo2 size={10} /> Undo last action
                  </button>
                )}

                {/* Keyboard hints */}
                <div className="text-[9px] text-center mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Keys: ← → navigate · A approve · R reject · Z undo · 1-5 set type
                </div>
              </>
            ) : (
              <button
                onClick={() => goToReviewNode(0)}
                disabled={reviewQueue.length === 0}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30"
                style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}
              >
                <Play size={12} /> Start reviewing ({reviewQueue.length} nodes)
              </button>
            )}
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
                {selectedNode.source === 'detected' && (
                  <span style={{ color: '#a855f7' }}> (AI detected)</span>
                )}
              </div>

              {/* Drag hint */}
              <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <GripVertical size={10} /> Drag the marker to reposition
              </div>

              {/* Actions (for nodes not in the quick review queue) */}
              {currentReviewIndex < 0 && (
                <>
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
                </>
              )}
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
