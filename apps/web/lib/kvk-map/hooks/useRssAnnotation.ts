import { useState, useCallback, useEffect } from 'react';
import type { RssNode, RssNodeType, RssNodeStatus, RssAnnotationMode } from '@/lib/kvk-map/rss-review';

export interface RssAnnotationState {
  rssReviewActive: boolean;
  rssAnnotationMode: RssAnnotationMode;
  activeRssType: RssNodeType;
  rssNextId: number;
  rssUndoStack: RssNode[][];
  rssDetecting: boolean;
  rssDetectProgress: string | null;
  rssReclassifying: boolean;
  rssFlyTarget: { x: number; y: number } | null;
  rssTypeFilter: RssNodeType | 'all';
  rssStatusFilter: RssNodeStatus | 'all';

  setRssReviewActive: (v: boolean) => void;
  setRssAnnotationMode: (mode: RssAnnotationMode) => void;
  setActiveRssType: (type: RssNodeType) => void;
  setRssTypeFilter: (filter: RssNodeType | 'all') => void;
  setRssStatusFilter: (filter: RssNodeStatus | 'all') => void;
  setRssDetecting: (v: boolean) => void;
  setRssDetectProgress: (v: string | null) => void;
  setRssReclassifying: (v: boolean) => void;
  setRssNextId: React.Dispatch<React.SetStateAction<number>>;
  setRssUndoStack: React.Dispatch<React.SetStateAction<RssNode[][]>>;

  toggleRssReview: () => void;
  flyTo: (x: number, y: number) => void;
  startFresh: (setRssNodes: (nodes: RssNode[]) => void) => void;
  undo: (setRssNodes: (nodes: RssNode[]) => void) => void;
}

export function useRssAnnotation(rssNodeCount: number): RssAnnotationState {
  const [rssReviewActive, setRssReviewActive] = useState(false);
  const [rssAnnotationMode, setRssAnnotationMode] = useState<RssAnnotationMode>('off');
  const [activeRssType, setActiveRssType] = useState<RssNodeType>('food');
  const [rssNextId, setRssNextId] = useState(0);
  const [rssUndoStack, setRssUndoStack] = useState<RssNode[][]>([]);
  const [rssDetecting, setRssDetecting] = useState(false);
  const [rssDetectProgress, setRssDetectProgress] = useState<string | null>(null);
  const [rssReclassifying, setRssReclassifying] = useState(false);
  const [rssFlyTarget, setRssFlyTarget] = useState<{ x: number; y: number } | null>(null);
  const [rssTypeFilter, setRssTypeFilter] = useState<RssNodeType | 'all'>('all');
  const [rssStatusFilter, setRssStatusFilter] = useState<RssNodeStatus | 'all'>('all');

  // Sync rssNextId when nodes load from Supabase/JSON
  useEffect(() => {
    if (rssNodeCount > 0) {
      setRssNextId((prev) => Math.max(prev, rssNodeCount));
    }
  }, [rssNodeCount]);

  const toggleRssReview = useCallback(() => {
    if (!rssReviewActive) {
      setRssUndoStack([]);
      setRssAnnotationMode('annotate');
      setRssReviewActive(true);
    } else {
      setRssReviewActive(false);
      setRssAnnotationMode('off');
    }
  }, [rssReviewActive]);

  const flyTo = useCallback((x: number, y: number) => {
    setRssFlyTarget({ x, y });
    setTimeout(() => setRssFlyTarget(null), 600);
  }, []);

  const startFresh = useCallback((setRssNodes: (nodes: RssNode[]) => void) => {
    setRssUndoStack([]);
    setRssNodes([]);
    setRssNextId(0);
  }, []);

  const undo = useCallback((setRssNodes: (nodes: RssNode[]) => void) => {
    setRssUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setRssNodes(prev);
      return stack.slice(0, -1);
    });
  }, []);

  return {
    rssReviewActive,
    rssAnnotationMode,
    activeRssType,
    rssNextId,
    rssUndoStack,
    rssDetecting,
    rssDetectProgress,
    rssReclassifying,
    rssFlyTarget,
    rssTypeFilter,
    rssStatusFilter,
    setRssReviewActive,
    setRssAnnotationMode,
    setActiveRssType,
    setRssTypeFilter,
    setRssStatusFilter,
    setRssDetecting,
    setRssDetectProgress,
    setRssReclassifying,
    setRssNextId,
    setRssUndoStack,
    toggleRssReview,
    flyTo,
    startFresh,
    undo,
  };
}
