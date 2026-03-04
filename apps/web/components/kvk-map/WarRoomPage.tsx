'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import MapBase from '@/components/kvk-map/MapBase';
import FeatureMarker from '@/components/kvk-map/FeatureMarker';
import FlagOverlay from '@/components/kvk-map/FlagOverlay';
import ZonePolygon from '@/components/kvk-map/ZonePolygon';
import ZoneLabel from '@/components/kvk-map/ZoneLabel';
import DrawingOverlay from '@/components/kvk-map/DrawingOverlay';
import CoordinateDisplay from '@/components/kvk-map/CoordinateDisplay';
import FeaturePalette from '@/components/kvk-map/admin/FeaturePalette';
import ZoneEditorPanel from '@/components/kvk-map/admin/ZoneEditorPanel';
import RssNodeOverlay from '@/components/kvk-map/admin/RssNodeOverlay';
import RssReviewPanel from '@/components/kvk-map/admin/RssReviewPanel';
import WarRoomHeader from './WarRoomHeader';
import AllianceList from './AllianceList';
import FeatureDetailPanel from './FeatureDetailPanel';
import AchievementProgressPanel from './AchievementProgressPanel';
import { useWarRoomAuth } from '@/lib/kvk-map/war-room-auth';
import {
  useActiveKvkMap,
  useKvkMapFeatures,
  useKvkMapZones,
  createMapFeature,
  updateMapFeature,
  updateMapZone,
  deleteMapFeature,
  updateFeaturePosition,
} from '@/lib/supabase/use-kvk-map';
import { supabase } from '@/lib/supabase';
import { useKvkAlliances, createAlliance, updateAlliance, deleteAlliance, fetchTopAlliancesFromRoster } from '@/lib/supabase/use-kvk-alliances';
import { useKvkAssignments, upsertAssignment, updateAssignment, deleteAssignment } from '@/lib/supabase/use-kvk-assignments';
import { useKvkStrategies, saveStrategy, loadStrategyByShareCode, deleteStrategy } from '@/lib/supabase/use-kvk-strategies';
import type { FeatureType, KvkMapFeature, KvkMapZone, KvkAssignment, AssignmentStatus } from '@/lib/kvk-map-types';
import { GAME_MAP_SIZE } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG, FEATURE_TYPE_TO_GROUP, FEATURE_GROUPS } from '@/lib/kvk-feature-config';
import { loadRssNodes, RSS_TYPE_COLORS, RSS_TYPE_LABELS, type RssNode, type RssNodeType, type RssNodeStatus, type RssAnnotationMode } from '@/lib/kvk-map/rss-review';
import { type SymmetryConfig, getSegment } from '@/lib/kvk-map/rss-symmetry';
import { detectNodesPixel, reclassifyNodeTypes } from '@/lib/kvk-map/pixel-detect';

function isFlagFeatureType(type: FeatureType): boolean {
  return !!FEATURE_TYPE_CONFIG[type]?.tileSize;
}

export default function WarRoomPage() {
  const { isAtLeast } = useWarRoomAuth();
  const searchParams = useSearchParams();
  const strategyCode = searchParams.get('strategy');

  // ── Data ───────────────────────────────────────────────────────────
  const { map, loading: mapLoading } = useActiveKvkMap();
  const { features, refetch: refetchFeatures } = useKvkMapFeatures(map?.id);
  const { zones, refetch: refetchZones } = useKvkMapZones(map?.id);
  const { alliances, loading: alliancesLoading, refetch: refetchAlliances } = useKvkAlliances(map?.id);
  const { assignments, refetch: refetchAssignments } = useKvkAssignments(map?.id);
  const { strategies, refetch: refetchStrategies } = useKvkStrategies(map?.id);

  // ── Strategy state ─────────────────────────────────────────────────
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [strategyAssignments, setStrategyAssignments] = useState<KvkAssignment[] | null>(null);

  // Load strategy from URL
  useEffect(() => {
    if (strategyCode && map?.id) {
      loadStrategyByShareCode(strategyCode).then((strategy) => {
        if (strategy) {
          setActiveStrategyId(strategy.id);
          setStrategyAssignments(strategy.assignments);
        }
      });
    }
  }, [strategyCode, map?.id]);

  // Auto-populate alliances from roster data when none exist
  useEffect(() => {
    if (!map?.id || alliancesLoading || alliances.length > 0) return;
    let cancelled = false;
    (async () => {
      // Double-check DB directly to avoid race conditions with Strict Mode
      const { data: existing } = await supabase
        .from('kvk_alliances')
        .select('id')
        .eq('map_id', map.id)
        .limit(1);
      if (cancelled || (existing && existing.length > 0)) return;

      const topAlliances = await fetchTopAlliancesFromRoster(6);
      if (cancelled || topAlliances.length === 0) return;
      for (let i = 0; i < topAlliances.length; i++) {
        await createAlliance(map.id, { ...topAlliances[i], sort_order: i });
      }
      await refetchAlliances();
    })();
    return () => { cancelled = true; };
  }, [map?.id, alliancesLoading, alliances.length, refetchAlliances]);

  const activeAssignments = strategyAssignments ?? assignments;

  // ── Bottom panel state ─────────────────────────────────────────────
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);

  // ── Feature UI state ───────────────────────────────────────────────
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<FeatureType | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(-1);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [placingForAllianceId, setPlacingForAllianceId] = useState<string | null>(null);

  // ── Zone hover state (for marker → zone highlight) ────────────────
  const [hoveredZoneNumber, setHoveredZoneNumber] = useState<number | null>(null);

  // ── Zone editing state ─────────────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [zoneVertices, setZoneVertices] = useState<[number, number][]>([]);

  // ── RSS review state (admin only) ─────────────────────────────────
  const [rssReviewActive, setRssReviewActive] = useState(false);
  const [rssNodes, setRssNodes] = useState<RssNode[]>([]);
  const [selectedRssNodeId, setSelectedRssNodeId] = useState<number | null>(null);
  const [rssTypeFilter, setRssTypeFilter] = useState<RssNodeType | 'all'>('all');
  const [rssStatusFilter, setRssStatusFilter] = useState<RssNodeStatus | 'all'>('all');

  // ── RSS annotation state (admin only) ───────────────────────────
  const [rssAnnotationMode, setRssAnnotationMode] = useState<RssAnnotationMode>('off');
  const [activeRssType, setActiveRssType] = useState<RssNodeType>('food');
  const [rssNextId, setRssNextId] = useState(0);
  const [rssUndoStack, setRssUndoStack] = useState<RssNode[][]>([]);
  const [rssDetecting, setRssDetecting] = useState(false);
  const [rssDetectProgress, setRssDetectProgress] = useState<string | null>(null);
  const [rssReclassifying, setRssReclassifying] = useState(false);
  const [rssFlyTarget, setRssFlyTarget] = useState<{ x: number; y: number } | null>(null);

  // Auto-save RSS nodes to localStorage
  const RSS_STORAGE_KEY = 'kvk-rss-annotation-nodes-v7';
  useEffect(() => {
    if (!rssReviewActive || rssNodes.length === 0) return;
    try {
      localStorage.setItem(RSS_STORAGE_KEY, JSON.stringify({ nodes: rssNodes, nextId: rssNextId }));
    } catch { /* quota exceeded — ignore */ }
  }, [rssNodes, rssNextId, rssReviewActive]);

  // ── Symmetry config ───────────────────────────────────────────────
  const symmetryConfig = useMemo<SymmetryConfig | null>(() => {
    if (!map) return null;
    // DB default is 1000 from old 2000-era coordinate system — always use map center
    const center = GAME_MAP_SIZE / 2;
    return {
      segments: map.symmetry_segments || 8,
      centerX: center,
      centerY: center,
    };
  }, [map]);

  const rssSourceCount = useMemo(() => rssNodes.filter((n) => n.source === 'manual').length, [rssNodes]);
  const rssDetectedCount = useMemo(() => rssNodes.filter((n) => n.source === 'detected').length, [rssNodes]);

  // ── Computed ────────────────────────────────────────────────────────
  const assignmentMap = useMemo(
    () => new Map(activeAssignments.map((a) => [a.feature_id, a])),
    [activeAssignments]
  );
  const allianceMap = useMemo(
    () => new Map(alliances.map((a) => [a.id, a])),
    [alliances]
  );

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId) || null,
    [features, selectedFeatureId]
  );
  const selectedAssignment = useMemo(
    () => (selectedFeatureId ? assignmentMap.get(selectedFeatureId) ?? null : null),
    [selectedFeatureId, assignmentMap]
  );
  const selectedAlliance = useMemo(
    () => (selectedAssignment ? allianceMap.get(selectedAssignment.alliance_id) ?? null : null),
    [selectedAssignment, allianceMap]
  );

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) || null,
    [zones, selectedZoneId]
  );

  const featureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of features) {
      counts[f.feature_type] = (counts[f.feature_type] || 0) + 1;
    }
    return counts;
  }, [features]);

  const filteredRssNodes = useMemo(
    () => rssNodes.filter((n) =>
      (rssTypeFilter === 'all' || n.type === rssTypeFilter) &&
      (rssStatusFilter === 'all' || n.status === rssStatusFilter)
    ),
    [rssNodes, rssTypeFilter, rssStatusFilter]
  );

  const showZones = !hiddenGroups.has('zones');

  const visibleFeatures = useMemo(
    () => features.filter((f) => !hiddenGroups.has(FEATURE_TYPE_TO_GROUP[f.feature_type as FeatureType])),
    [features, hiddenGroups]
  );

  const allGroupKeys = useMemo(
    () => ['zones', ...FEATURE_GROUPS.map((g) => g.key)],
    []
  );

  const allHidden = useMemo(
    () => allGroupKeys.every((k) => hiddenGroups.has(k)),
    [allGroupKeys, hiddenGroups]
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Z: undo in annotation or review mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && (rssAnnotationMode === 'annotate' || rssAnnotationMode === 'review')) {
        e.preventDefault();
        setRssUndoStack((stack) => {
          if (stack.length === 0) return stack;
          const prev = stack[stack.length - 1];
          setRssNodes(prev);
          return stack.slice(0, -1);
        });
        return;
      }
      if (e.key === 'Escape') {
        if (isDrawingZone) {
          setIsDrawingZone(false);
          setZoneVertices([]);
          return;
        }
        if (rssAnnotationMode === 'annotate') {
          setRssAnnotationMode('review');
          return;
        }
        setPlacingType(null);
        setIsPlacing(false);
        setPlacingForAllianceId(null);
        setSelectedFeatureId(null);
        setSelectedZoneId(null);
        setSelectedRssNodeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingZone, rssAnnotationMode]);

  // ── Visibility toggles ─────────────────────────────────────────────
  const handleToggleGroup = useCallback((groupKey: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setHiddenGroups((prev) => {
      const allCurrentlyHidden = allGroupKeys.every((k) => prev.has(k));
      return allCurrentlyHidden ? new Set() : new Set(allGroupKeys);
    });
  }, [allGroupKeys]);

  // ── Feature handlers (admin, or officer for flags) ─────────────────
  const handleSelectType = useCallback((type: FeatureType) => {
    const canPlace = isAtLeast('admin') || (isAtLeast('officer') && isFlagFeatureType(type));
    if (!canPlace) return;
    setPlacingType(type);
    setIsPlacing(true);
    setSelectedFeatureId(null);
    setSelectedZoneId(null);
    setIsDrawingZone(false);
    setZoneVertices([]);
    if (isFlagFeatureType(type) && alliances.length > 0) {
      setPlacingForAllianceId(alliances[0].id);
    } else {
      setPlacingForAllianceId(null);
    }
    const group = FEATURE_TYPE_TO_GROUP[type];
    if (group) {
      setHiddenGroups((prev) => {
        if (!prev.has(group)) return prev;
        const next = new Set(prev);
        next.delete(group);
        return next;
      });
    }
  }, [isAtLeast, alliances]);

  const handleCancelPlacement = useCallback(() => {
    setPlacingType(null);
    setIsPlacing(false);
    setPlacingForAllianceId(null);
  }, []);

  const handleFeatureClick = useCallback(
    (feature: KvkMapFeature) => {
      if (isPlacing || isDrawingZone) return;
      setSelectedFeatureId((prev) => (prev === feature.id ? null : feature.id));
      setSelectedZoneId(null);
    },
    [isPlacing, isDrawingZone]
  );

  const handleFeatureMouseOver = useCallback(
    (feature: KvkMapFeature) => {
      if (feature.zone != null) setHoveredZoneNumber(feature.zone);
    },
    []
  );

  const handleFeatureMouseOut = useCallback(() => {
    setHoveredZoneNumber(null);
  }, []);

  const handleFeatureDragEnd = useCallback(
    async (feature: KvkMapFeature, newX: number, newY: number) => {
      const canDrag = isAtLeast('admin') || (isAtLeast('officer') && isFlagFeatureType(feature.feature_type as FeatureType));
      if (!canDrag) return;
      await updateFeaturePosition(feature.id, newX, newY);
      await refetchFeatures();
    },
    [isAtLeast, refetchFeatures]
  );

  const handleSaveFeature = useCallback(
    async (featureId: string, updates: Partial<KvkMapFeature>) => {
      await updateMapFeature(featureId, updates);
      await refetchFeatures();
    },
    [refetchFeatures]
  );

  const handleDeleteFeature = useCallback(
    async (featureId: string) => {
      await deleteMapFeature(featureId);
      setSelectedFeatureId(null);
      await refetchFeatures();
    },
    [refetchFeatures]
  );

  // ── Zone handlers (admin only) ─────────────────────────────────────
  const handleZoneClick = useCallback(
    (zone: KvkMapZone) => {
      if (isPlacing || isDrawingZone) return;
      setSelectedZoneId((prev) => (prev === zone.id ? null : zone.id));
      setSelectedFeatureId(null);
    },
    [isPlacing, isDrawingZone]
  );

  const handleStartDrawing = useCallback(() => {
    if (!isAtLeast('admin')) return;
    setIsDrawingZone(true);
    setZoneVertices([]);
    setIsPlacing(false);
    setPlacingType(null);
  }, [isAtLeast]);

  const handleUndoVertex = useCallback(() => {
    setZoneVertices((prev) => prev.slice(0, -1));
  }, []);

  const handleFinishDrawing = useCallback(async () => {
    if (zoneVertices.length < 3 || !selectedZone) return;
    const success = await updateMapZone(selectedZone.id, { polygon: zoneVertices });
    if (success) {
      await refetchZones();
      setIsDrawingZone(false);
      setZoneVertices([]);
      setSelectedZoneId(null);
    }
  }, [zoneVertices, selectedZone, refetchZones]);

  const handleCancelDrawing = useCallback(() => {
    setIsDrawingZone(false);
    setZoneVertices([]);
  }, []);

  // ── Alliance handlers (officer+) ──────────────────────────────────
  const handleCreateAlliance = useCallback(
    async (data: { tag: string; name: string; role: 'top' | 'support'; color: string }) => {
      if (!map) return;
      await createAlliance(map.id, { ...data, sort_order: alliances.length });
      await refetchAlliances();
    },
    [map, alliances.length, refetchAlliances]
  );

  const handleUpdateAlliance = useCallback(
    async (id: string, updates: Partial<{ tag: string; name: string; role: 'top' | 'support'; color: string }>) => {
      await updateAlliance(id, updates);
      await refetchAlliances();
    },
    [refetchAlliances]
  );

  const handleDeleteAlliance = useCallback(
    async (id: string) => {
      await deleteAlliance(id);
      await refetchAlliances();
    },
    [refetchAlliances]
  );

  // ── Assignment handlers (officer+) ─────────────────────────────────
  const handleAssign = useCallback(
    async (featureId: string, allianceId: string, data?: { status?: AssignmentStatus; priority?: number; notes?: string }) => {
      if (!map) return;
      await upsertAssignment(map.id, featureId, allianceId, data);
      await refetchAssignments();
    },
    [map, refetchAssignments]
  );

  const handleUpdateAssignment = useCallback(
    async (assignmentId: string, updates: Partial<KvkAssignment>) => {
      await updateAssignment(assignmentId, updates);
      await refetchAssignments();
    },
    [refetchAssignments]
  );

  const handleUnassign = useCallback(
    async (assignmentId: string) => {
      await deleteAssignment(assignmentId);
      await refetchAssignments();
    },
    [refetchAssignments]
  );

  // ── Strategy handlers ──────────────────────────────────────────────
  const handleSelectStrategy = useCallback(
    async (strategyId: string | null) => {
      if (!strategyId) {
        setActiveStrategyId(null);
        setStrategyAssignments(null);
        return;
      }
      const strategy = strategies.find((s) => s.id === strategyId);
      if (strategy) {
        setActiveStrategyId(strategy.id);
        setStrategyAssignments(strategy.assignments);
      }
    },
    [strategies]
  );

  const handleSaveStrategy = useCallback(
    async (name: string) => {
      if (!map) return;
      await saveStrategy(map.id, name, assignments, alliances);
      await refetchStrategies();
    },
    [map, assignments, alliances, refetchStrategies]
  );

  const handleDeleteStrategy = useCallback(
    async (strategyId: string) => {
      await deleteStrategy(strategyId);
      if (activeStrategyId === strategyId) {
        setActiveStrategyId(null);
        setStrategyAssignments(null);
      }
      await refetchStrategies();
    },
    [activeStrategyId, refetchStrategies]
  );

  // ── RSS review handlers (admin only) ────────────────────────────────
  const handleToggleRssReview = useCallback(() => {
    if (!rssReviewActive) {
      // Restore saved session from localStorage (manual + approved nodes survive)
      let restored = false;
      try {
        const saved = localStorage.getItem(RSS_STORAGE_KEY);
        if (saved) {
          const { nodes, nextId } = JSON.parse(saved);
          if (Array.isArray(nodes) && nodes.length > 0) {
            const cleaned = nodes.filter(
              (n: RssNode) =>
                n.source === 'manual' || n.status === 'approved' || n.status === 'rejected' || n.status === 'pending',
            );
            if (cleaned.length > 0) {
              setRssNodes(cleaned);
              setRssNextId(nextId || nodes.length);
              restored = true;
            }
          }
        }
      } catch { /* corrupt data — start fresh */ }
      if (!restored) {
        // No localStorage session — load annotations from JSON file
        loadRssNodes().then((nodes) => {
          if (nodes.length > 0) {
            setRssNodes(nodes);
            setRssNextId(nodes.length);
          }
        });
      }
      setSelectedRssNodeId(null);
      setRssUndoStack([]);
      setRssAnnotationMode('annotate');
      setRssReviewActive(true);
    } else {
      setRssReviewActive(false);
      setRssAnnotationMode('off');
    }
  }, [rssReviewActive]);

  const handleRssLoadExisting = useCallback(async () => {
    const nodes = await loadRssNodes();
    setRssNodes(nodes);
    setRssNextId(nodes.length);
    setSelectedRssNodeId(null);
    setRssUndoStack([]);
  }, []);

  const handleRssNodeMove = useCallback((id: number, x: number, y: number) => {
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  const handleRssNodeChangeType = useCallback((id: number, type: RssNodeType) => {
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, type } : n)));
  }, []);

  const handleRssBatchChangeType = useCallback((fromFilter: RssNodeType | 'all', toType: RssNodeType) => {
    setRssNodes((prev) => prev.map((n) => {
      if (n.source !== 'detected' || n.status !== 'pending') return n;
      if (fromFilter !== 'all' && n.type !== fromFilter) return n;
      return { ...n, type: toType };
    }));
  }, []);

  const handleRssReclassify = useCallback(async () => {
    if (!map || rssReclassifying) return;
    setRssReclassifying(true);
    try {
      // Training data: manual nodes + approved detected nodes (user-corrected)
      const training = rssNodes
        .filter((n) => n.source === 'manual' || n.status === 'approved')
        .map((n) => ({ x: n.x, y: n.y, type: n.type }));
      // Pending detected nodes to re-classify
      const pending = rssNodes.filter((n) => n.source === 'detected' && n.status === 'pending');
      if (training.length === 0 || pending.length === 0) return;

      const newTypes = await reclassifyNodeTypes(
        map.image_path,
        training,
        pending.map((n) => ({ x: n.x, y: n.y })),
        setRssDetectProgress,
      );

      // Apply new types to pending nodes
      const typeMap = new Map<number, string>();
      pending.forEach((n, i) => typeMap.set(n.id, newTypes[i]));

      setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
      setRssNodes((prev) => prev.map((n) =>
        typeMap.has(n.id) ? { ...n, type: typeMap.get(n.id) as RssNodeType } : n
      ));

      setRssDetectProgress(`Re-classified ${pending.length} nodes from ${training.length} corrections`);
      setTimeout(() => setRssDetectProgress(null), 5000);
    } catch (error) {
      console.error('Re-classification failed:', error);
      setRssDetectProgress(`Error: ${error instanceof Error ? error.message : 'Re-classification failed'}`);
      setTimeout(() => setRssDetectProgress(null), 5000);
    } finally {
      setRssReclassifying(false);
    }
  }, [map, rssReclassifying, rssNodes]);

  const handleRssNodeApprove = useCallback((id: number) => {
    setRssUndoStack((stack) => [...stack.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'approved' as RssNodeStatus } : n)));
  }, [rssNodes]);

  const handleRssNodeReject = useCallback((id: number) => {
    setRssUndoStack((stack) => [...stack.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'rejected' as RssNodeStatus } : n)));
  }, [rssNodes]);

  const handleRssBulkApprove = useCallback((typeFilter: RssNodeType | 'all') => {
    setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => {
      if (n.source !== 'detected' || n.status !== 'pending') return n;
      if (typeFilter !== 'all' && n.type !== typeFilter) return n;
      return { ...n, status: 'approved' as RssNodeStatus };
    }));
    setSelectedRssNodeId(null);
  }, [rssNodes]);

  const handleRssBulkReject = useCallback((typeFilter: RssNodeType | 'all') => {
    setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => {
      if (n.source !== 'detected' || n.status !== 'pending') return n;
      if (typeFilter !== 'all' && n.type !== typeFilter) return n;
      return { ...n, status: 'rejected' as RssNodeStatus };
    }));
    setSelectedRssNodeId(null);
  }, [rssNodes]);

  const handleRssNodeDelete = useCallback((id: number) => {
    setRssNodes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleRssExport = useCallback(() => {
    const exportNodes = rssNodes
      .filter((n) => n.status !== 'rejected')
      .map(({ type, x, y, status, source }) => ({ type, x, y, status, source }));
    const blob = new Blob([JSON.stringify(exportNodes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rss_nodes_corrected.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [rssNodes]);

  // ── RSS annotation handlers ────────────────────────────────────────
  const handleRssDetect = useCallback(async () => {
    if (!map || rssDetecting) return;
    // Use manual nodes + approved corrections as training data
    const trainingNodes = rssNodes.filter((n) => n.source === 'manual' || n.status === 'approved');
    if (trainingNodes.length === 0) return;

    setRssDetecting(true);

    try {
      const annotations = trainingNodes.map((n) => ({ x: n.x, y: n.y, type: n.type }));
      const detected = await detectNodesPixel(
        map.image_path,
        annotations,
        setRssDetectProgress,
      );

      // Filter overlaps with training nodes (within 5 game units)
      let nextId = rssNextId;
      const detectedNodes: RssNode[] = detected
        .filter((n) => !trainingNodes.some((m) => Math.hypot(m.x - n.x, m.y - n.y) < 5))
        .map((n) => ({
          id: nextId++,
          type: n.type,
          x: n.x,
          y: n.y,
          status: 'pending' as const,
          source: 'detected' as const,
          segment: 0,
        }));

      setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
      setRssNodes((prev) => {
        const withoutOldDetected = prev.filter((n) => n.source !== 'detected');
        return [...withoutOldDetected, ...detectedNodes];
      });
      setRssNextId(nextId);
      setRssDetectProgress(`Found ${detectedNodes.length} new nodes`);
      setTimeout(() => setRssDetectProgress(null), 5000);
    } catch (error) {
      console.error('RSS detection failed:', error);
      setRssDetectProgress(`Error: ${error instanceof Error ? error.message : 'Detection failed'}`);
      setTimeout(() => setRssDetectProgress(null), 5000);
    } finally {
      setRssDetecting(false);
    }
  }, [map, rssDetecting, rssNodes, rssNextId]);

  const handleRssFlyTo = useCallback((x: number, y: number) => {
    setRssFlyTarget({ x, y });
    setTimeout(() => setRssFlyTarget(null), 600);
  }, []);

  const handleRssClearDetected = useCallback(() => {
    setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
    // Keep: manual nodes + anything user has reviewed (approved/rejected)
    setRssNodes((prev) => prev.filter((n) =>
      n.source === 'manual' || n.status === 'approved' || n.status === 'rejected'
    ));
  }, [rssNodes]);

  const handleRssStartFresh = useCallback(() => {
    setRssUndoStack([]);
    setRssNodes([]);
    setRssNextId(0);
    setSelectedRssNodeId(null);
    try { localStorage.removeItem(RSS_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleRssUndo = useCallback(() => {
    if (rssUndoStack.length === 0) return;
    const prev = rssUndoStack[rssUndoStack.length - 1];
    setRssUndoStack((s) => s.slice(0, -1));
    setRssNodes(prev);
  }, [rssUndoStack]);

  // ── Map click/move ─────────────────────────────────────────────────
  const handleMouseMove = useCallback((x: number, y: number) => {
    setMousePos({ x, y });
  }, []);

  const handleMapClick = useCallback(
    async (x: number, y: number) => {
      if (isDrawingZone && isAtLeast('admin')) {
        setZoneVertices((prev) => [...prev, [x, y]]);
        return;
      }
      // RSS annotation: click to place node anywhere
      if (rssAnnotationMode === 'annotate' && symmetryConfig) {
        const seg = getSegment(x, y, symmetryConfig);
        const newNode: RssNode = {
          id: rssNextId,
          type: activeRssType,
          x: Math.round(x),
          y: Math.round(y),
          status: 'pending',
          source: 'manual',
          segment: seg,
        };
        setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
        setRssNodes((prev) => [...prev, newNode]);
        setRssNextId((prev) => prev + 1);
        setSelectedRssNodeId(newNode.id);
        return;
      }
      if (!isPlacing || !placingType || !map) return;
      const canPlace = isAtLeast('admin') || (isAtLeast('officer') && isFlagFeatureType(placingType));
      if (!canPlace) return;
      const sameType = features.filter((f) => f.feature_type === placingType);
      const lastOfType = sameType[sameType.length - 1];
      const config = FEATURE_TYPE_CONFIG[placingType];
      const defaults = {
        level: lastOfType?.level ?? config.defaultLevel,
        zone: lastOfType?.zone ?? null,
      };
      const newFeature = await createMapFeature(map.id, placingType, x, y, defaults);
      if (newFeature) {
        if (isFlagFeatureType(placingType) && placingForAllianceId) {
          await upsertAssignment(map.id, newFeature.id, placingForAllianceId);
          await refetchAssignments();
        }
        await refetchFeatures();
        setSelectedFeatureId(newFeature.id);
      }
    },
    [isDrawingZone, isPlacing, placingType, map, features, refetchFeatures, isAtLeast, placingForAllianceId, refetchAssignments, rssAnnotationMode, symmetryConfig, rssNextId, activeRssType, rssNodes]
  );

  const handleMapDoubleClick = useCallback(
    async (x: number, y: number) => {
      if (!isDrawingZone || !selectedZone || !isAtLeast('admin')) return;
      const finalVertices: [number, number][] = [...zoneVertices, [x, y]];
      if (finalVertices.length < 3) return;
      const success = await updateMapZone(selectedZone.id, { polygon: finalVertices });
      if (success) {
        await refetchZones();
        setIsDrawingZone(false);
        setZoneVertices([]);
        setSelectedZoneId(null);
      }
    },
    [isDrawingZone, zoneVertices, selectedZone, refetchZones, isAtLeast]
  );

  // ── Role checks (must be before early returns to satisfy Rules of Hooks) ──
  const isAdminMode = isAtLeast('admin');
  const isOfficerMode = isAtLeast('officer');

  const officerEditableGroups = useMemo(
    () => (!isAdminMode && isOfficerMode ? new Set(['flags']) : undefined),
    [isAdminMode, isOfficerMode]
  );

  // ── Render ─────────────────────────────────────────────────────────
  if (mapLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-5 h-5 border border-[#4318ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!map) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
        No active map found. Run the migration SQL to create one.
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto p-4 md:p-6">
      <WarRoomHeader
        strategies={strategies}
        activeStrategyId={activeStrategyId}
        onSelectStrategy={handleSelectStrategy}
        onSaveStrategy={handleSaveStrategy}
        onDeleteStrategy={handleDeleteStrategy}
      />

      {/* Strategy banner */}
      {activeStrategyId && (
        <div
          className="flex items-center justify-between px-3 py-2 mb-3 rounded-lg text-xs"
          style={{ backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <span style={{ color: '#8b5cf6' }}>
            Viewing strategy: <strong>{strategies.find((s) => s.id === activeStrategyId)?.name}</strong>
          </span>
          <button
            onClick={() => { setActiveStrategyId(null); setStrategyAssignments(null); }}
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: 'rgba(139,92,246,0.2)', color: '#8b5cf6' }}
          >
            Return to live
          </button>
        </div>
      )}

      <div className="flex flex-col h-[calc(100vh-180px)]">
        {/* Map row: left sidebar + map + right sidebar */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          {/* Left sidebar */}
          <div className="lg:w-56 shrink-0 overflow-y-auto space-y-3">
            {isOfficerMode && (
              <AllianceList
                alliances={alliances}
                onCreate={handleCreateAlliance}
                onUpdate={handleUpdateAlliance}
                onDelete={handleDeleteAlliance}
              />
            )}
            {/* RSS Review toggle (admin only) */}
            {isAdminMode && (
              <button
                onClick={handleToggleRssReview}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: rssReviewActive ? 'rgba(34,197,94,0.15)' : 'var(--background-card)',
                  color: rssReviewActive ? '#22c55e' : 'var(--text-muted)',
                  border: `1px solid ${rssReviewActive ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rssReviewActive ? '#22c55e' : 'var(--text-muted)' }} />
                RSS Node Review
                {rssReviewActive && <span className="ml-auto text-[10px]">{rssNodes.length}</span>}
              </button>
            )}
            <FeaturePalette
              selectedType={placingType}
              isPlacing={isPlacing}
              onSelectType={handleSelectType}
              onCancelPlacement={handleCancelPlacement}
              featureCounts={featureCounts}
              hiddenGroups={hiddenGroups}
              onToggleGroup={handleToggleGroup}
              allHidden={allHidden}
              onToggleAll={handleToggleAll}
              readOnly={!isAdminMode}
              editableGroupKeys={officerEditableGroups}
            />
          </div>

          {/* Center: Map */}
          <div
            className="flex-1 relative rounded-xl overflow-hidden border min-h-[300px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <MapBase
              imageUrl={map.image_path}
              onClick={handleMapClick}
              onDoubleClick={handleMapDoubleClick}
              onMouseMove={handleMouseMove}
              onZoomChange={setZoom}
              cursorStyle={(isPlacing && placingType) || (isDrawingZone && isAdminMode) || rssAnnotationMode === 'annotate' ? 'crosshair' : undefined}
            >
              {showZones && zones.map((zone) => (
                <ZonePolygon
                  key={zone.id}
                  zone={zone}
                  onClick={handleZoneClick}
                  isSelected={zone.id === selectedZoneId}
                  isHighlighted={hoveredZoneNumber != null && zone.zone_number === hoveredZoneNumber}
                />
              ))}
              {showZones && zones.map((zone) => (
                <ZoneLabel key={`label-${zone.id}`} zone={zone} zoom={zoom} />
              ))}
              {visibleFeatures.map((feature) => {
                const assignment = isOfficerMode ? assignmentMap.get(feature.id) : undefined;
                const alliance = assignment ? allianceMap.get(assignment.alliance_id) : undefined;
                const cfg = FEATURE_TYPE_CONFIG[feature.feature_type];
                if (cfg?.tileSize) {
                  return (
                    <FlagOverlay
                      key={feature.id}
                      feature={feature}
                      isSelected={feature.id === selectedFeatureId}
                      isDraggable={(isAdminMode || isOfficerMode) && !isPlacing && !isDrawingZone}
                      zoom={zoom}
                      allianceColor={alliance?.color}
                      allianceTag={alliance?.tag}
                      assignmentStatus={assignment?.status}
                      onClick={handleFeatureClick}
                      onDragEnd={handleFeatureDragEnd}
                      onMouseOver={handleFeatureMouseOver}
                      onMouseOut={handleFeatureMouseOut}
                    />
                  );
                }
                return (
                  <FeatureMarker
                    key={feature.id}
                    feature={feature}
                    isSelected={feature.id === selectedFeatureId}
                    isDraggable={isAdminMode && !isPlacing && !isDrawingZone}
                    zoom={zoom}
                    allianceColor={alliance?.color}
                    allianceTag={alliance?.tag}
                    assignmentStatus={assignment?.status}
                    onClick={handleFeatureClick}
                    onDragEnd={handleFeatureDragEnd}
                    onMouseOver={handleFeatureMouseOver}
                    onMouseOut={handleFeatureMouseOut}
                  />
                );
              })}
              {rssReviewActive && (
                <RssNodeOverlay
                  nodes={filteredRssNodes}
                  selectedId={selectedRssNodeId}
                  interactive={!isPlacing && !isDrawingZone && rssAnnotationMode !== 'annotate'}
                  onSelect={setSelectedRssNodeId}
                  onMove={handleRssNodeMove}
                  zoom={zoom}
                  flyToTarget={rssFlyTarget}
                />
              )}
              {isDrawingZone && (
                <DrawingOverlay vertices={zoneVertices} currentPoint={mousePos} />
              )}
            </MapBase>
            <CoordinateDisplay x={mousePos?.x ?? null} y={mousePos?.y ?? null} />

            {/* Mode indicator */}
            {isPlacing && placingType && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  color: FEATURE_TYPE_CONFIG[placingType].color,
                  border: '1px solid var(--border)',
                }}
              >
                <span>Placing: {FEATURE_TYPE_CONFIG[placingType].label}</span>
                {isFlagFeatureType(placingType) && alliances.length > 0 && (
                  <select
                    value={placingForAllianceId || ''}
                    onChange={(e) => setPlacingForAllianceId(e.target.value || null)}
                    className="bg-transparent border rounded px-1.5 py-0.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'inherit' }}
                  >
                    {alliances.map((a) => (
                      <option key={a.id} value={a.id} style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>
                        [{a.tag}] {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <span style={{ color: 'var(--text-muted)' }}>(click map · Esc to cancel)</span>
              </div>
            )}
            {isDrawingZone && selectedZone && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  color: selectedZone.color,
                  border: '1px solid var(--border)',
                }}
              >
                Drawing: {selectedZone.name || `Zone ${selectedZone.zone_number}`} — {zoneVertices.length} vertices (double-click to finish, Esc to cancel)
              </div>
            )}
            {rssAnnotationMode === 'annotate' && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  color: RSS_TYPE_COLORS[activeRssType],
                  border: '1px solid var(--border)',
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[activeRssType] }} />
                <span>Placing: {RSS_TYPE_LABELS[activeRssType]}</span>
                <span style={{ color: 'var(--text-muted)' }}>(click map to place · Esc to stop)</span>
              </div>
            )}
          </div>

          {/* Right sidebar — feature/zone detail or RSS review */}
          {(selectedZone || selectedFeature || rssReviewActive) && (
            <div className="lg:w-72 shrink-0 overflow-y-auto">
              {rssReviewActive ? (
                <RssReviewPanel
                  nodes={rssNodes}
                  selectedId={selectedRssNodeId}
                  typeFilter={rssTypeFilter}
                  statusFilter={rssStatusFilter}
                  onTypeFilterChange={setRssTypeFilter}
                  onStatusFilterChange={setRssStatusFilter}
                  onChangeType={handleRssNodeChangeType}
                  onApprove={handleRssNodeApprove}
                  onReject={handleRssNodeReject}
                  onDelete={handleRssNodeDelete}
                  onSelect={setSelectedRssNodeId}
                  onExport={handleRssExport}
                  onClose={handleToggleRssReview}
                  onFlyTo={handleRssFlyTo}
                  annotationMode={rssAnnotationMode}
                  onAnnotationModeChange={setRssAnnotationMode}
                  activeRssType={activeRssType}
                  onActiveRssTypeChange={setActiveRssType}
                  sourceCount={rssSourceCount}
                  detectedCount={rssDetectedCount}
                  canUndo={rssUndoStack.length > 0}
                  onDetect={handleRssDetect}
                  detecting={rssDetecting}
                  detectProgress={rssDetectProgress}
                  onClearDetected={handleRssClearDetected}
                  onStartFresh={handleRssStartFresh}
                  onUndo={handleRssUndo}
                  onLoadExisting={handleRssLoadExisting}
                  onBatchChangeType={handleRssBatchChangeType}
                  onReclassify={handleRssReclassify}
                  reclassifying={rssReclassifying}
                  onBulkApprove={handleRssBulkApprove}
                  onBulkReject={handleRssBulkReject}
                />
              ) : selectedZone ? (
                isAdminMode ? (
                  <ZoneEditorPanel
                    zone={selectedZone}
                    isDrawing={isDrawingZone}
                    vertexCount={zoneVertices.length}
                    onStartDrawing={handleStartDrawing}
                    onUndoVertex={handleUndoVertex}
                    onFinishDrawing={handleFinishDrawing}
                    onCancelDrawing={handleCancelDrawing}
                    onClose={() => {
                      setSelectedZoneId(null);
                      setIsDrawingZone(false);
                      setZoneVertices([]);
                    }}
                  />
                ) : (
                  <div
                    className="rounded-xl p-4 border"
                    style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: selectedZone.color }} />
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                        {selectedZone.name || `Zone ${selectedZone.zone_number}`}
                      </h3>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {selectedZone.polygon.length} vertices
                    </p>
                  </div>
                )
              ) : selectedFeature ? (
                <FeatureDetailPanel
                  feature={selectedFeature}
                  assignment={isOfficerMode ? selectedAssignment : null}
                  alliance={isOfficerMode ? selectedAlliance : null}
                  alliances={isOfficerMode ? alliances : []}
                  onSave={(isAdminMode || (isOfficerMode && isFlagFeatureType(selectedFeature.feature_type as FeatureType))) ? handleSaveFeature : undefined}
                  onDelete={(isAdminMode || (isOfficerMode && isFlagFeatureType(selectedFeature.feature_type as FeatureType))) ? handleDeleteFeature : undefined}
                  onAssign={isAtLeast('officer') ? handleAssign : undefined}
                  onUpdateAssignment={isAtLeast('officer') ? handleUpdateAssignment : undefined}
                  onUnassign={isAtLeast('officer') ? handleUnassign : undefined}
                  onClose={() => setSelectedFeatureId(null)}
                />
              ) : null}
            </div>
          )}
        </div>

        {/* Bottom panel: Achievement Progress */}
        <AchievementProgressPanel
          features={features}
          assignments={isOfficerMode ? activeAssignments : []}
          alliances={isOfficerMode ? alliances : []}
          collapsed={!bottomPanelOpen}
          onToggle={() => setBottomPanelOpen((v) => !v)}
        />
      </div>
    </div>
  );
}
