'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import FeatureDetailPanel from './FeatureDetailPanel';
import AchievementProgressPanel from './AchievementProgressPanel';
import PlannerSidebar from './PlannerSidebar';
import AllocationPlanPanel from './AllocationPlanPanel';
import ZonePlanPanel from './ZonePlanPanel';
import { isPointInPolygon } from '@/lib/kvk-map/point-in-zone';
import { useWarRoomAuth } from '@/lib/kvk-map/war-room-auth';
import { useMapSelection, useMapPlacement, useRssAnnotation, useFlagPath, useMapLayers } from '@/lib/kvk-map/hooks';
import {
  useActiveKvkMap,
  useKvkMapFeatures,
  useKvkMapZones,
  createMapFeature,
  updateMapFeature,
  updateMapZone,
  deleteMapFeature,
  updateFeaturePosition,
  updateMapStage,
} from '@/lib/supabase/use-kvk-map';
import { supabase } from '@/lib/supabase';
import { useKvkAlliances, createAlliance, updateAlliance, deleteAlliance, fetchTopAlliancesFromRoster } from '@/lib/supabase/use-kvk-alliances';
import { useKvkAssignments, upsertAssignment, updateAssignment, deleteAssignment } from '@/lib/supabase/use-kvk-assignments';
import { useKvkAllocationTargets, upsertAllocationTarget, deleteAllocationTarget } from '@/lib/supabase/use-kvk-allocation-targets';
import { useKvkStrategies, saveStrategy, loadStrategyByShareCode, deleteStrategy } from '@/lib/supabase/use-kvk-strategies';
import type { FeatureType, KvkMapFeature, KvkMapZone, KvkAssignment, AssignmentStatus } from '@/lib/kvk-map-types';
import { GAME_MAP_SIZE } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG, FEATURE_TYPE_TO_GROUP } from '@/lib/kvk-feature-config';
import { KVK_STAGES } from '@/lib/kvk-stages';
import { RSS_TYPE_COLORS, RSS_TYPE_LABELS, type RssNode, type RssNodeType, type RssNodeStatus } from '@/lib/kvk-map/rss-review';
import { useKvkRssNodes, useKvkRssFlags, saveRssNodes, flagRssNode } from '@/lib/supabase/use-kvk-rss';
import { type SymmetryConfig, getSegment } from '@/lib/kvk-map/rss-symmetry';
import { detectNodesPixel, reclassifyNodeTypes } from '@/lib/kvk-map/pixel-detect';
import FlagPathOverlay from '@/components/kvk-map/FlagPathOverlay';
import FlagPathPanel from '@/components/kvk-map/FlagPathPanel';
import AnnotationOverlay from '@/components/kvk-map/AnnotationOverlay';
import AnnotationPanel from '@/components/kvk-map/AnnotationPanel';
import RightSidebar from '@/components/kvk-map/RightSidebar';
import StatusBar from '@/components/kvk-map/StatusBar';
import {
  useKvkArrows, createArrow, deleteArrow,
  useKvkDrawings, createDrawing, deleteDrawing,
  useKvkLabels, createLabel, updateLabel, deleteLabel,
  useKvkZoneNotes, upsertZoneNote,
  useKvkZoneActions, createZoneAction, toggleZoneAction, deleteZoneAction,
} from '@/lib/supabase/use-kvk-annotations';
import type { AnnotationTool, ArrowType } from '@/lib/kvk-map-types';
import { getArrowColor } from '@/lib/kvk-map/annotation-constants';

function isFlagFeatureType(type: FeatureType): boolean {
  return !!FEATURE_TYPE_CONFIG[type]?.tileSize;
}

export default function WarRoomPage() {
  const { isAtLeast, officerName } = useWarRoomAuth();
  const searchParams = useSearchParams();
  const strategyCode = searchParams.get('strategy');

  // ── Data ───────────────────────────────────────────────────────────
  const { map, loading: mapLoading, refetch: refetchMap } = useActiveKvkMap();
  const { features, refetch: refetchFeatures } = useKvkMapFeatures(map?.id);
  const { zones, refetch: refetchZones } = useKvkMapZones(map?.id);
  const { alliances, loading: alliancesLoading, refetch: refetchAlliances } = useKvkAlliances(map?.id);
  const { assignments, refetch: refetchAssignments } = useKvkAssignments(map?.id);
  const { strategies, refetch: refetchStrategies } = useKvkStrategies(map?.id);
  const { rssNodes, setRssNodes, refetch: refetchRss } = useKvkRssNodes(map?.id);
  const { flags: rssFlags, refetch: refetchRssFlags } = useKvkRssFlags(map?.id);
  const { targets: allocationTargets, refetch: refetchTargets } = useKvkAllocationTargets(map?.id);

  // ── Annotation data ─────────────────────────────────────────────
  const { arrows, refetch: refetchArrows } = useKvkArrows(map?.id);
  const { drawings, refetch: refetchDrawings } = useKvkDrawings(map?.id);
  const { labels: mapLabels, refetch: refetchLabels } = useKvkLabels(map?.id);
  const { notes: zoneNotes, refetch: refetchNotes } = useKvkZoneNotes(map?.id);
  const { actions: zoneActions, refetch: refetchActions } = useKvkZoneActions(map?.id);

  // ── Extracted hooks ──────────────────────────────────────────────
  const selection = useMapSelection();
  const placement = useMapPlacement();
  const layers = useMapLayers();
  const rssState = useRssAnnotation(rssNodes.length);
  const flagPath = useFlagPath();

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

  // ── Remaining local state ────────────────────────────────────────
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(-1);
  const [highlightedAllianceId, setHighlightedAllianceId] = useState<string | null>(null);

  // ── Annotation state ────────────────────────────────────────────
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('select');
  const [annotationArrowType, setAnnotationArrowType] = useState<ArrowType>('attack');
  const [annotationColor, setAnnotationColor] = useState('#ef4444');
  const [annotationSelectedId, setAnnotationSelectedId] = useState<string | null>(null);
  const [warPlanOpen, setWarPlanOpen] = useState(false);
  // Live drawing state
  const [liveDrawingPoints, setLiveDrawingPoints] = useState<[number, number][]>([]);
  const isDrawingFreehand = useRef(false);
  // Live arrow state
  const [liveArrowPoints, setLiveArrowPoints] = useState<[number, number][]>([]);
  // Pending inline text label
  const [pendingLabel, setPendingLabel] = useState<{ x: number; y: number; color: string } | null>(null);

  // Guard: prevent zone click from overriding a feature click (Leaflet event bubbling)
  const featureJustClicked = useRef(false);

  // ── Undo stack for feature position changes ──────────────────────
  const undoStack = useRef<{ featureId: string; oldX: number; oldY: number }[]>([]);

  // ── Zone editing state ─────────────────────────────────────────────
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [zoneVertices, setZoneVertices] = useState<[number, number][]>([]);

  // ── Symmetry config ───────────────────────────────────────────────
  const symmetryConfig = useMemo<SymmetryConfig | null>(() => {
    if (!map) return null;
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
    () => features.find((f) => f.id === selection.selectedFeatureId) || null,
    [features, selection.selectedFeatureId]
  );
  const selectedAssignment = useMemo(
    () => (selection.selectedFeatureId ? assignmentMap.get(selection.selectedFeatureId) ?? null : null),
    [selection.selectedFeatureId, assignmentMap]
  );
  const selectedAlliance = useMemo(
    () => (selectedAssignment ? allianceMap.get(selectedAssignment.alliance_id) ?? null : null),
    [selectedAssignment, allianceMap]
  );

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selection.selectedZoneId) || null,
    [zones, selection.selectedZoneId]
  );

  const selectedRssNode = useMemo(
    () => (selection.selectedRssNodeId != null ? rssNodes.find((n) => n.id === selection.selectedRssNodeId) ?? null : null),
    [rssNodes, selection.selectedRssNodeId]
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
      (rssState.rssTypeFilter === 'all' || n.type === rssState.rssTypeFilter) &&
      (rssState.rssStatusFilter === 'all' || n.status === rssState.rssStatusFilter)
    ),
    [rssNodes, rssState.rssTypeFilter, rssState.rssStatusFilter]
  );

  const visibleFeatures = useMemo(
    () => features.filter((f) => {
      if (layers.hiddenGroups.has(FEATURE_TYPE_TO_GROUP[f.feature_type as FeatureType])) return false;
      if (!isAtLeast('officer') && isFlagFeatureType(f.feature_type as FeatureType)) return false;
      return true;
    }),
    [features, layers.hiddenGroups, isAtLeast]
  );

  // Flag counts per zone (keyed by zone id)
  const flagCountByZone = useMemo(() => {
    const counts: Record<string, number> = {};
    const flags = features.filter((f) => isFlagFeatureType(f.feature_type as FeatureType));
    for (const zone of zones) {
      counts[zone.id] = flags.filter((f) => isPointInPolygon(f.x, f.y, zone.polygon)).length;
    }
    return counts;
  }, [features, zones]);

  // ── Nudge & undo helpers ──────────────────────────────────────────
  const nudgeFeatureRef = useRef<((dx: number, dy: number) => void) | null>(null);
  const undoFeatureMoveRef = useRef<(() => void) | null>(null);

  // Keep refs up to date so the keydown handler doesn't need these in deps
  useEffect(() => {
    nudgeFeatureRef.current = (dx: number, dy: number) => {
      const feature = features.find((f) => f.id === selection.selectedFeatureId);
      if (!feature) return;
      const canDrag = isAtLeast('admin') || (isAtLeast('officer') && isFlagFeatureType(feature.feature_type as FeatureType));
      if (!canDrag) return;
      undoStack.current.push({ featureId: feature.id, oldX: feature.x, oldY: feature.y });
      updateFeaturePosition(feature.id, feature.x + dx, feature.y + dy).then(() => refetchFeatures());
    };
  }, [features, selection.selectedFeatureId, isAtLeast, refetchFeatures]);

  useEffect(() => {
    undoFeatureMoveRef.current = () => {
      const entry = undoStack.current.pop();
      if (!entry) return;
      updateFeaturePosition(entry.featureId, entry.oldX, entry.oldY).then(() => refetchFeatures());
    };
  }, [refetchFeatures]);

  // ── Annotation handlers ─────────────────────────────────────────────
  const currentStage = map?.current_stage ?? 1;

  // All zone numbers that have been reached (current + prior stages)
  const activeZoneNumbers = useMemo(() => {
    const nums = new Set<number>();
    for (const s of KVK_STAGES) {
      if (s.stage <= currentStage) nums.add(s.zoneNumber);
    }
    return [...nums];
  }, [currentStage]);

  const handleAnnotationToolChange = useCallback((tool: AnnotationTool) => {
    // Clear any in-progress drawing/arrow/label
    setLiveDrawingPoints([]);
    setLiveArrowPoints([]);
    setPendingLabel(null);
    isDrawingFreehand.current = false;
    setAnnotationTool(tool);
    if (tool !== 'select') {
      // Clear conflicting modes
      placement.cancelPlacement();
      selection.clearSelection();
      setAnnotationSelectedId(null);
      if (!warPlanOpen) setWarPlanOpen(true);
    }
  }, [placement, selection, warPlanOpen]);

  const handleAnnotationClick = useCallback((type: 'arrow' | 'drawing' | 'label', id: string) => {
    setAnnotationSelectedId(annotationSelectedId === id ? null : id);
  }, [annotationSelectedId]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    // Try all three tables (only one will match)
    const arrowMatch = arrows.find((a) => a.id === id);
    const drawMatch = drawings.find((d) => d.id === id);
    const labelMatch = mapLabels.find((l) => l.id === id);
    if (arrowMatch) { await deleteArrow(id); await refetchArrows(); }
    else if (drawMatch) { await deleteDrawing(id); await refetchDrawings(); }
    else if (labelMatch) { await deleteLabel(id); await refetchLabels(); }
    if (annotationSelectedId === id) setAnnotationSelectedId(null);
  }, [arrows, drawings, mapLabels, annotationSelectedId, refetchArrows, refetchDrawings, refetchLabels]);

  const handleSaveNote = useCallback(async (zoneId: string, content: string) => {
    if (!map) return;
    await upsertZoneNote(map.id, zoneId, currentStage, content, officerName || undefined);
    await refetchNotes();
  }, [map, currentStage, officerName, refetchNotes]);

  const handleToggleAction = useCallback(async (id: string, checked: boolean) => {
    await toggleZoneAction(id, checked, officerName || undefined);
    await refetchActions();
  }, [officerName, refetchActions]);

  const handleCreateAction = useCallback(async (zoneId: string, label: string) => {
    if (!map) return;
    const existing = zoneActions.filter((a) => a.zone_id === zoneId && a.stage === currentStage);
    await createZoneAction(map.id, zoneId, currentStage, label, existing.length, officerName || undefined);
    await refetchActions();
  }, [map, currentStage, zoneActions, officerName, refetchActions]);

  const handleDeleteAction = useCallback(async (id: string) => {
    await deleteZoneAction(id);
    await refetchActions();
  }, [refetchActions]);

  const handleLabelDragEnd = useCallback(async (id: string, x: number, y: number) => {
    await updateLabel(id, { x, y });
    await refetchLabels();
  }, [refetchLabels]);

  const handleToggleWarPlan = useCallback(() => {
    setWarPlanOpen((v) => !v);
  }, []);

  // ── Create arrow from two points ─────────────────────────────────────
  const createArrowFromPoints = useCallback(async (start: [number, number], end: [number, number]) => {
    if (!map) return;
    const arrowColor = getArrowColor(annotationArrowType);
    await createArrow(map.id, {
      waypoints: [start, end],
      arrow_type: annotationArrowType,
      color_override: arrowColor,
      stage: currentStage,
      created_by: officerName || undefined,
    });
    await refetchArrows();
  }, [map, annotationArrowType, currentStage, officerName, refetchArrows]);

  // ── Confirm pending label helper ──────────────────────────────────
  const handlePendingLabelConfirm = useCallback(async (text: string) => {
    if (!map || !pendingLabel) return;
    await createLabel(map.id, {
      x: pendingLabel.x,
      y: pendingLabel.y,
      text,
      color: pendingLabel.color,
      stage: currentStage,
      created_by: officerName || undefined,
    });
    await refetchLabels();
    setPendingLabel(null);
  }, [map, pendingLabel, currentStage, officerName, refetchLabels]);

  const handlePendingLabelCancel = useCallback(() => {
    setPendingLabel(null);
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Ctrl/Cmd+Z: undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (rssState.rssAnnotationMode === 'annotate' || rssState.rssAnnotationMode === 'review') {
          e.preventDefault();
          rssState.undo(setRssNodes);
          return;
        }
        if (undoStack.current.length > 0) {
          e.preventDefault();
          undoFeatureMoveRef.current?.();
          return;
        }
      }

      // Arrow keys: nudge selected feature (hold Shift for 5x)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selection.selectedFeatureId) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        nudgeFeatureRef.current?.(dx, dy);
        return;
      }

      // Enter: no longer needed for arrows (two-click model)

      if (e.key === 'Escape') {
        // Cancel pending text label
        if (pendingLabel) {
          setPendingLabel(null);
          return;
        }
        // Annotation tool: cancel current drawing/arrow, then reset to select
        if (annotationTool !== 'select') {
          if (liveDrawingPoints.length > 0) { setLiveDrawingPoints([]); isDrawingFreehand.current = false; return; }
          if (liveArrowPoints.length > 0) { setLiveArrowPoints([]); return; }
          setAnnotationTool('select');
          return;
        }
        if (flagPath.addingWaypoint) {
          flagPath.setAddingWaypoint(false);
          return;
        }
        if (flagPath.addingFlag) {
          flagPath.setAddingFlag(false);
          return;
        }
        if (flagPath.active) {
          flagPath.clear();
          return;
        }
        if (isDrawingZone) {
          setIsDrawingZone(false);
          setZoneVertices([]);
          return;
        }
        if (rssState.rssAnnotationMode === 'annotate') {
          rssState.setRssAnnotationMode('review');
          return;
        }
        if (annotationSelectedId) {
          setAnnotationSelectedId(null);
          return;
        }
        placement.cancelPlacement();
        selection.clearSelection();
      }

      // Delete/Backspace: delete selected annotation (only when not in an input)
      if ((e.key === 'Delete' || e.key === 'Backspace') && annotationSelectedId && !isTyping) {
        e.preventDefault();
        handleDeleteAnnotation(annotationSelectedId);
        return;
      }

      // Annotation tool shortcuts (only when war plan is open and not typing)
      if (warPlanOpen && !isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const toolMap: Record<string, AnnotationTool> = { v: 'select', a: 'arrow', d: 'draw', t: 'text', x: 'eraser' };
        const tool = toolMap[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          handleAnnotationToolChange(tool);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingZone, rssState.rssAnnotationMode, flagPath.active, flagPath.addingWaypoint, flagPath.addingFlag, selection.selectedFeatureId, annotationTool, liveDrawingPoints, liveArrowPoints, annotationSelectedId, warPlanOpen, handleAnnotationToolChange, pendingLabel, handleDeleteAnnotation]);

  // ── Feature handlers (admin, or officer for flags) ─────────────────
  const handleSelectType = useCallback((type: FeatureType) => {
    const canPlace = isAtLeast('admin') || (isAtLeast('officer') && isFlagFeatureType(type));
    if (!canPlace) return;
    if (flagPath.active) flagPath.clear();
    selection.setSelectedFeatureId(null);
    selection.setSelectedZoneId(null);
    setIsDrawingZone(false);
    setZoneVertices([]);
    const allianceId = isFlagFeatureType(type) && alliances.length > 0 ? alliances[0].id : null;
    placement.startPlacement(type, allianceId);
    const group = FEATURE_TYPE_TO_GROUP[type];
    if (group) layers.ensureVisible(group);
  }, [isAtLeast, alliances, flagPath, selection, placement, layers]);

  const handlePlaceFlag = useCallback(() => {
    if (placement.isPlacing && placement.placingType === 'flag') {
      placement.cancelPlacement();
    } else {
      handleSelectType('flag' as FeatureType);
    }
  }, [placement, handleSelectType]);

  const handlePlaceFortress = useCallback(() => {
    if (placement.isPlacing && placement.placingType === 'fortress') {
      placement.cancelPlacement();
    } else {
      handleSelectType('fortress' as FeatureType);
    }
  }, [placement, handleSelectType]);

  const handleFeatureClick = useCallback(
    (feature: KvkMapFeature) => {
      if (placement.isPlacing || isDrawingZone) return;
      // Don't select features during annotation drawing modes
      if (warPlanOpen && annotationTool !== 'select' && annotationTool !== 'eraser') return;
      featureJustClicked.current = true;
      setTimeout(() => { featureJustClicked.current = false; }, 0);
      selection.setSelectedFeatureId(selection.selectedFeatureId === feature.id ? null : feature.id);
      selection.setSelectedZoneId(null);
    },
    [placement.isPlacing, isDrawingZone, selection, warPlanOpen, annotationTool]
  );

  const handleFeatureMouseOver = useCallback(
    (feature: KvkMapFeature) => {
      if (feature.zone != null) selection.setHoveredZoneNumber(feature.zone);
    },
    [selection]
  );

  const handleFeatureMouseOut = useCallback(() => {
    selection.setHoveredZoneNumber(null);
  }, [selection]);

  const handleFeatureDragEnd = useCallback(
    async (feature: KvkMapFeature, newX: number, newY: number) => {
      const canDrag = isAtLeast('admin') || (isAtLeast('officer') && isFlagFeatureType(feature.feature_type as FeatureType));
      if (!canDrag) return;
      undoStack.current.push({ featureId: feature.id, oldX: feature.x, oldY: feature.y });
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
      selection.setSelectedFeatureId(null);
      await refetchFeatures();
    },
    [refetchFeatures, selection]
  );

  // ── Zone handlers (admin only) ─────────────────────────────────────
  const handleZoneClick = useCallback(
    (zone: KvkMapZone) => {
      if (placement.isPlacing || isDrawingZone) return;
      if (featureJustClicked.current) return;
      // Don't handle zone clicks during annotation drawing modes
      if (warPlanOpen && annotationTool !== 'select') return;
      selection.setSelectedZoneId(selection.selectedZoneId === zone.id ? null : zone.id);
      selection.setSelectedFeatureId(null);
    },
    [placement.isPlacing, isDrawingZone, selection, warPlanOpen, annotationTool]
  );

  const handleStartDrawing = useCallback(() => {
    if (!isAtLeast('admin')) return;
    setIsDrawingZone(true);
    setZoneVertices([]);
    placement.cancelPlacement();
  }, [isAtLeast, placement]);

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
      selection.setSelectedZoneId(null);
    }
  }, [zoneVertices, selectedZone, refetchZones, selection]);

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
      await upsertAssignment(map.id, featureId, allianceId, { ...data, assigned_by: officerName });
      await refetchAssignments();
    },
    [map, refetchAssignments, officerName]
  );

  const handleUpdateAssignment = useCallback(
    async (assignmentId: string, updates: Partial<KvkAssignment>) => {
      await updateAssignment(assignmentId, { ...updates, assigned_by: officerName });
      await refetchAssignments();
    },
    [refetchAssignments, officerName]
  );

  const handleUnassign = useCallback(
    async (assignmentId: string) => {
      await deleteAssignment(assignmentId);
      await refetchAssignments();
    },
    [refetchAssignments]
  );

  // ── Allocation target handlers ──────────────────────────────────────
  const handleUpsertTarget = useCallback(
    async (allianceId: string, featureGroup: string, count: number) => {
      if (!map) return;
      await upsertAllocationTarget(map.id, allianceId, featureGroup, count);
      await refetchTargets();
    },
    [map, refetchTargets]
  );

  const handleDeleteTarget = useCallback(
    async (allianceId: string, featureGroup: string) => {
      if (!map) return;
      await deleteAllocationTarget(map.id, allianceId, featureGroup);
      await refetchTargets();
    },
    [map, refetchTargets]
  );

  // ── Stage handler ─────────────────────────────────────────────────
  const handleStageChange = useCallback(
    async (stage: number) => {
      if (!map) return;
      await updateMapStage(map.id, stage);
      await refetchMap();
    },
    [map, refetchMap]
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
    if (!rssState.rssReviewActive) {
      if (flagPath.active) flagPath.clear();
      selection.setSelectedRssNodeId(null);
    }
    rssState.toggleRssReview();
  }, [rssState, flagPath, selection]);

  const handleRssLoadExisting = useCallback(async () => {
    await refetchRss();
    selection.setSelectedRssNodeId(null);
    rssState.setRssUndoStack([]);
  }, [refetchRss, selection, rssState]);

  const handleRssNodeMove = useCallback((id: number, x: number, y: number) => {
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, [setRssNodes]);

  const handleRssNodeChangeType = useCallback((id: number, type: RssNodeType) => {
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, type } : n)));
  }, [setRssNodes]);

  const handleRssBatchChangeType = useCallback((fromFilter: RssNodeType | 'all', toType: RssNodeType) => {
    setRssNodes((prev) => prev.map((n) => {
      if (n.source !== 'detected' || n.status !== 'pending') return n;
      if (fromFilter !== 'all' && n.type !== fromFilter) return n;
      return { ...n, type: toType };
    }));
  }, [setRssNodes]);

  const handleRssReclassify = useCallback(async () => {
    if (!map || rssState.rssReclassifying) return;
    rssState.setRssReclassifying(true);
    try {
      const training = rssNodes
        .filter((n) => n.source === 'manual' || n.status === 'approved')
        .map((n) => ({ x: n.x, y: n.y, type: n.type }));
      const pending = rssNodes.filter((n) => n.source === 'detected' && n.status === 'pending');
      if (training.length === 0 || pending.length === 0) return;

      const newTypes = await reclassifyNodeTypes(
        map.image_path,
        training,
        pending.map((n) => ({ x: n.x, y: n.y })),
        rssState.setRssDetectProgress,
      );

      const typeMap = new Map<number, string>();
      pending.forEach((n, i) => typeMap.set(n.id, newTypes[i]));

      rssState.setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
      setRssNodes((prev) => prev.map((n) =>
        typeMap.has(n.id) ? { ...n, type: typeMap.get(n.id) as RssNodeType } : n
      ));

      rssState.setRssDetectProgress(`Re-classified ${pending.length} nodes from ${training.length} corrections`);
      setTimeout(() => rssState.setRssDetectProgress(null), 5000);
    } catch (error) {
      console.error('Re-classification failed:', error);
      rssState.setRssDetectProgress(`Error: ${error instanceof Error ? error.message : 'Re-classification failed'}`);
      setTimeout(() => rssState.setRssDetectProgress(null), 5000);
    } finally {
      rssState.setRssReclassifying(false);
    }
  }, [map, rssState, rssNodes, setRssNodes]);

  const handleRssNodeApprove = useCallback((id: number) => {
    rssState.setRssUndoStack((stack) => [...stack.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'approved' as RssNodeStatus } : n)));
  }, [rssNodes, rssState, setRssNodes]);

  const handleRssNodeReject = useCallback((id: number) => {
    rssState.setRssUndoStack((stack) => [...stack.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'rejected' as RssNodeStatus } : n)));
  }, [rssNodes, rssState, setRssNodes]);

  const handleRssBulkApprove = useCallback((typeFilter: RssNodeType | 'all') => {
    rssState.setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => {
      if (n.source !== 'detected' || n.status !== 'pending') return n;
      if (typeFilter !== 'all' && n.type !== typeFilter) return n;
      return { ...n, status: 'approved' as RssNodeStatus };
    }));
    selection.setSelectedRssNodeId(null);
  }, [rssNodes, rssState, setRssNodes, selection]);

  const handleRssBulkReject = useCallback((typeFilter: RssNodeType | 'all') => {
    rssState.setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.map((n) => {
      if (n.source !== 'detected' || n.status !== 'pending') return n;
      if (typeFilter !== 'all' && n.type !== typeFilter) return n;
      return { ...n, status: 'rejected' as RssNodeStatus };
    }));
    selection.setSelectedRssNodeId(null);
  }, [rssNodes, rssState, setRssNodes, selection]);

  const handleRssNodeDelete = useCallback((id: number) => {
    setRssNodes((prev) => prev.filter((n) => n.id !== id));
  }, [setRssNodes]);

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
    if (!map || rssState.rssDetecting) return;
    const trainingNodes = rssNodes.filter((n) => n.source === 'manual' || n.status === 'approved');
    if (trainingNodes.length === 0) return;

    rssState.setRssDetecting(true);

    try {
      const annotations = trainingNodes.map((n) => ({ x: n.x, y: n.y, type: n.type }));
      const detected = await detectNodesPixel(
        map.image_path,
        annotations,
        rssState.setRssDetectProgress,
      );

      let nextId = rssState.rssNextId;
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

      rssState.setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
      setRssNodes((prev) => {
        const withoutOldDetected = prev.filter((n) => n.source !== 'detected');
        return [...withoutOldDetected, ...detectedNodes];
      });
      rssState.setRssNextId(nextId);
      rssState.setRssDetectProgress(`Found ${detectedNodes.length} new nodes`);
      setTimeout(() => rssState.setRssDetectProgress(null), 5000);
    } catch (error) {
      console.error('RSS detection failed:', error);
      rssState.setRssDetectProgress(`Error: ${error instanceof Error ? error.message : 'Detection failed'}`);
      setTimeout(() => rssState.setRssDetectProgress(null), 5000);
    } finally {
      rssState.setRssDetecting(false);
    }
  }, [map, rssState, rssNodes, setRssNodes]);

  const handleRssClearDetected = useCallback(() => {
    rssState.setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
    setRssNodes((prev) => prev.filter((n) =>
      n.source === 'manual' || n.status === 'approved' || n.status === 'rejected'
    ));
  }, [rssNodes, rssState, setRssNodes]);

  const handleRssStartFresh = useCallback(() => {
    rssState.startFresh(setRssNodes);
    selection.setSelectedRssNodeId(null);
  }, [rssState, setRssNodes, selection]);

  const handleRssUndo = useCallback(() => {
    rssState.undo(setRssNodes);
  }, [rssState, setRssNodes]);

  const handleRssSaveToServer = useCallback(async () => {
    if (!map?.id) return;
    rssState.setRssDetectProgress('Saving to server...');
    const success = await saveRssNodes(map.id, rssNodes);
    rssState.setRssDetectProgress(success ? 'Saved to server!' : 'Save failed — check console');
    setTimeout(() => rssState.setRssDetectProgress(null), 3000);
  }, [map?.id, rssNodes, rssState]);

  const handleFlagRssNode = useCallback(async () => {
    if (!map?.id || !selectedRssNode) return;
    await flagRssNode(map.id, selectedRssNode.x, selectedRssNode.y, selectedRssNode.type);
    await refetchRssFlags();
  }, [map?.id, selectedRssNode, refetchRssFlags]);

  // ── Flag path planner: orchestrator handlers ──────────────────────
  const handleToggleFlagPath = useCallback(() => {
    if (!flagPath.active) {
      // Clear conflicting modes
      placement.cancelPlacement();
      setIsDrawingZone(false);
      setZoneVertices([]);
      selection.clearSelection();
      rssState.setRssReviewActive(false);
      rssState.setRssAnnotationMode('off');
    }
    flagPath.toggle();
  }, [flagPath, placement, selection, rssState]);

  const handleApplyFlagPath = useCallback(async (allianceId: string | null) => {
    if (!map || flagPath.flags.length === 0) return;
    const planned = flagPath.flags.filter((f) => f.status === 'planned');
    if (planned.length === 0) return;
    for (const flag of planned) {
      const newFeature = await createMapFeature(map.id, 'flag', flag.x, flag.y);
      if (newFeature && allianceId) {
        await upsertAssignment(map.id, newFeature.id, allianceId, { assigned_by: officerName });
      }
    }
    await refetchFeatures();
    await refetchAssignments();
    flagPath.clear();
  }, [map, flagPath, refetchFeatures, refetchAssignments, officerName]);

  // ── Map click/move ─────────────────────────────────────────────────
  const handleMouseMove = useCallback((x: number, y: number) => {
    setMousePos({ x, y });
    // Freehand drawing: append points while mouse is down
    if (isDrawingFreehand.current && annotationTool === 'draw') {
      setLiveDrawingPoints((prev) => [...prev, [Math.round(x), Math.round(y)]]);
    }
  }, [annotationTool]);

  // Mouse up: finish freehand drawing
  useEffect(() => {
    const handleMouseUp = async () => {
      if (!isDrawingFreehand.current || !map) return;
      isDrawingFreehand.current = false;
      if (liveDrawingPoints.length >= 2) {
        await createDrawing(map.id, {
          points: liveDrawingPoints,
          color: annotationColor,
          weight: 3,
          stage: currentStage,
          created_by: officerName || undefined,
        });
        await refetchDrawings();
      }
      setLiveDrawingPoints([]);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [map, liveDrawingPoints, annotationColor, currentStage, officerName, refetchDrawings]);

  const handleMapClick = useCallback(
    async (x: number, y: number) => {
      // ── Annotation tools ────────────────────────────────────────
      if (annotationTool === 'arrow' && map) {
        const point: [number, number] = [Math.round(x), Math.round(y)];
        if (liveArrowPoints.length === 0) {
          // First click: set start point
          setLiveArrowPoints([point]);
        } else {
          // Second click: create arrow and reset
          await createArrowFromPoints(liveArrowPoints[0], point);
          setLiveArrowPoints([]);
        }
        return;
      }
      if (annotationTool === 'draw') {
        // mousedown starts freehand; handled via mousemove + mouseup
        isDrawingFreehand.current = true;
        setLiveDrawingPoints([[Math.round(x), Math.round(y)]]);
        return;
      }
      if (annotationTool === 'text') {
        // Place an inline text input at the click position
        setPendingLabel({ x: Math.round(x), y: Math.round(y), color: annotationColor });
        return;
      }
      if (annotationTool === 'eraser') {
        // Eraser clicks are handled by the overlay item click handlers
        return;
      }

      // Flag path: add waypoint or manual flag
      if (flagPath.active) {
        if (flagPath.addingWaypoint) {
          flagPath.addWaypoint(x, y);
          return;
        }
        if (flagPath.addingFlag) {
          flagPath.addFlagManual(x, y, rssNodes);
          return;
        }
        return;
      }
      if (isDrawingZone && isAtLeast('admin')) {
        setZoneVertices((prev) => [...prev, [x, y]]);
        return;
      }
      // RSS annotation: click to place node anywhere
      if (rssState.rssAnnotationMode === 'annotate' && symmetryConfig) {
        const seg = getSegment(x, y, symmetryConfig);
        const newNode: RssNode = {
          id: rssState.rssNextId,
          type: rssState.activeRssType,
          x: Math.round(x),
          y: Math.round(y),
          status: 'pending',
          source: 'manual',
          segment: seg,
        };
        rssState.setRssUndoStack((prev) => [...prev.slice(-19), rssNodes]);
        setRssNodes((prev) => [...prev, newNode]);
        rssState.setRssNextId((prev) => prev + 1);
        selection.setSelectedRssNodeId(newNode.id);
        return;
      }
      if (!placement.isPlacing || !placement.placingType || !map) return;
      const canPlace = isAtLeast('admin') || (isAtLeast('officer') && isFlagFeatureType(placement.placingType));
      if (!canPlace) return;
      const sameType = features.filter((f) => f.feature_type === placement.placingType);
      const lastOfType = sameType[sameType.length - 1];
      const config = FEATURE_TYPE_CONFIG[placement.placingType];
      const defaults = {
        level: lastOfType?.level ?? config.defaultLevel,
        zone: lastOfType?.zone ?? null,
      };
      const placingType = placement.placingType;
      const newFeature = await createMapFeature(map.id, placingType, x, y, defaults);
      if (newFeature) {
        if (isFlagFeatureType(placingType) && placement.placingForAllianceId) {
          await upsertAssignment(map.id, newFeature.id, placement.placingForAllianceId, { assigned_by: officerName });
          await refetchAssignments();
        }
        const keepPlacing = isFlagFeatureType(placingType);
        if (!keepPlacing) {
          placement.cancelPlacement();
        }
        await refetchFeatures();
        if (!keepPlacing) {
          selection.setSelectedFeatureId(newFeature.id);
        }
      }
    },
    [isDrawingZone, placement, map, features, refetchFeatures, isAtLeast, refetchAssignments, rssState, symmetryConfig, rssNodes, setRssNodes, flagPath, selection, officerName, annotationTool, annotationColor, currentStage, refetchLabels, liveArrowPoints, createArrowFromPoints]
  );

  const handleMapDoubleClick = useCallback(
    async (x: number, y: number) => {
      // Arrow double-click: no longer used (Enter to finish instead)
      // Zone drawing still uses double-click to finish
      if (!isDrawingZone || !selectedZone || !isAtLeast('admin')) return;
      const finalVertices: [number, number][] = [...zoneVertices, [x, y]];
      if (finalVertices.length < 3) return;
      const success = await updateMapZone(selectedZone.id, { polygon: finalVertices });
      if (success) {
        await refetchZones();
        setIsDrawingZone(false);
        setZoneVertices([]);
        selection.setSelectedZoneId(null);
      }
    },
    [isDrawingZone, zoneVertices, selectedZone, refetchZones, isAtLeast, selection]
  );

  // ── Role checks (must be before early returns to satisfy Rules of Hooks) ──
  const isAdminMode = isAtLeast('admin');
  const isOfficerMode = isAtLeast('officer');
  const isOfficerZoneFocus = isOfficerMode && !isAdminMode && !!selection.selectedZoneId;

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
        warPlanActive={warPlanOpen}
        onToggleWarPlan={handleToggleWarPlan}
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
          <div className="lg:w-56 shrink-0 overflow-y-auto">
            {isOfficerMode ? (
              <PlannerSidebar
                alliances={alliances}
                highlightedAllianceId={highlightedAllianceId}
                onHighlight={setHighlightedAllianceId}
                onCreateAlliance={handleCreateAlliance}
                onUpdateAlliance={handleUpdateAlliance}
                onDeleteAlliance={handleDeleteAlliance}
                featureCounts={featureCounts}
                hiddenGroups={layers.hiddenGroups}
                onToggleGroup={layers.toggleGroup}
                onPlaceFlag={handlePlaceFlag}
                isPlacingFlag={placement.isPlacing && placement.placingType === 'flag'}
                onPlaceFortress={handlePlaceFortress}
                isPlacingFortress={placement.isPlacing && placement.placingType === 'fortress'}
                flagPathActive={flagPath.active}
                flagCount={flagPath.flags.length}
                onToggleFlagPath={handleToggleFlagPath}
                warPlanActive={warPlanOpen}
                onToggleWarPlan={handleToggleWarPlan}
                isAdmin={isAdminMode}
                adminContent={
                  <>
                    <button
                      onClick={handleToggleRssReview}
                      className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-xs font-medium transition-all"
                      style={{
                        backgroundColor: rssState.rssReviewActive ? 'rgba(34,197,94,0.15)' : 'var(--background-card)',
                        color: rssState.rssReviewActive ? '#22c55e' : 'var(--text-muted)',
                        border: `1px solid ${rssState.rssReviewActive ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                      }}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rssState.rssReviewActive ? '#22c55e' : 'var(--text-muted)' }} />
                      RSS Node Review
                      {rssState.rssReviewActive && <span className="ml-auto text-[10px]">{rssNodes.length}</span>}
                    </button>
                    <FeaturePalette
                      selectedType={placement.placingType}
                      isPlacing={placement.isPlacing}
                      onSelectType={handleSelectType}
                      onCancelPlacement={placement.cancelPlacement}
                      featureCounts={featureCounts}
                      hiddenGroups={layers.hiddenGroups}
                      onToggleGroup={layers.toggleGroup}
                      allHidden={layers.allHidden}
                      onToggleAll={layers.toggleAll}
                      readOnly={false}
                    />
                  </>
                }
              />
            ) : (
              <div className="space-y-3">
                <FeaturePalette
                  selectedType={placement.placingType}
                  isPlacing={placement.isPlacing}
                  onSelectType={handleSelectType}
                  onCancelPlacement={placement.cancelPlacement}
                  featureCounts={featureCounts}
                  hiddenGroups={layers.hiddenGroups}
                  onToggleGroup={layers.toggleGroup}
                  allHidden={layers.allHidden}
                  onToggleAll={layers.toggleAll}
                  readOnly={true}
                />
              </div>
            )}
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
              cursorStyle={(annotationTool !== 'select') || (flagPath.active && (flagPath.addingWaypoint || flagPath.addingFlag)) || (placement.isPlacing && placement.placingType) || (isDrawingZone && isAdminMode) || rssState.rssAnnotationMode === 'annotate' ? 'crosshair' : undefined}
              keyboardEnabled={!selection.selectedFeatureId}
              disableDoubleClickZoom={warPlanOpen || isDrawingZone}
              disableDragging={annotationTool === 'draw' && warPlanOpen}
            >
              {layers.showZones && zones.map((zone) => (
                <ZonePolygon
                  key={zone.id}
                  zone={zone}
                  onClick={warPlanOpen && annotationTool !== 'select' ? undefined : handleZoneClick}
                  isSelected={zone.id === selection.selectedZoneId}
                  isHighlighted={selection.hoveredZoneNumber != null && zone.zone_number === selection.hoveredZoneNumber}
                  activeZoneNumbers={isAtLeast('officer') ? activeZoneNumbers : null}
                  disableHover={warPlanOpen || isAtLeast('officer')}
                />
              ))}
              {layers.showZones && zones.map((zone) => (
                <ZoneLabel key={`label-${zone.id}`} zone={zone} zoom={zoom} flagCount={flagCountByZone[zone.id] || 0} />
              ))}
              {visibleFeatures.map((feature) => {
                const assignment = isOfficerMode ? assignmentMap.get(feature.id) : undefined;
                const alliance = assignment ? allianceMap.get(assignment.alliance_id) : undefined;
                const cfg = FEATURE_TYPE_CONFIG[feature.feature_type];
                const dimmedByAlliance = !!highlightedAllianceId && assignment?.alliance_id !== highlightedAllianceId;
                const dimmedByZone = isOfficerZoneFocus && selectedZone != null && !isPointInPolygon(feature.x, feature.y, selectedZone.polygon);
                const isDimmed = dimmedByAlliance || dimmedByZone;
                if (cfg?.tileSize) {
                  return (
                    <FlagOverlay
                      key={feature.id}
                      feature={feature}
                      isSelected={feature.id === selection.selectedFeatureId}
                      isDraggable={(isAdminMode || isOfficerMode) && !placement.isPlacing && !isDrawingZone}
                      dimmed={isDimmed}
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
                    isSelected={feature.id === selection.selectedFeatureId}
                    isDraggable={isAdminMode && !placement.isPlacing && !isDrawingZone}
                    dimmed={isDimmed}
                    minimal={!isOfficerMode}
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
              {rssNodes.length > 0 && (
                <RssNodeOverlay
                  nodes={rssState.rssReviewActive ? filteredRssNodes : rssNodes}
                  selectedId={selection.selectedRssNodeId}
                  interactive={isAtLeast('officer') && !placement.isPlacing && !isDrawingZone && rssState.rssAnnotationMode !== 'annotate'}
                  onSelect={isAtLeast('officer') ? selection.setSelectedRssNodeId : undefined}
                  onMove={rssState.rssReviewActive ? handleRssNodeMove : undefined}
                  zoom={zoom}
                  flyToTarget={rssState.rssFlyTarget}
                />
              )}
              {flagPath.active && (
                <FlagPathOverlay
                  waypoints={flagPath.waypoints}
                  flags={flagPath.flags}
                  rssNodes={rssNodes}
                  coveredNodeIds={flagPath.result?.coveredNodes ?? new Set()}
                  currentPoint={mousePos}
                  isAddingWaypoint={flagPath.addingWaypoint}
                  isAddingFlag={flagPath.addingFlag}
                  zoom={zoom}
                  selectedFlagId={flagPath.selectedFlagId}
                  onWaypointDragEnd={flagPath.waypointDragEnd}
                  onFlagDragEnd={(id, x, y) => flagPath.flagDragEnd(id, x, y, rssNodes)}
                  onFlagClick={(id) => flagPath.setSelectedFlagId(flagPath.selectedFlagId === id ? null : id)}
                />
              )}
              {isDrawingZone && (
                <DrawingOverlay vertices={zoneVertices} currentPoint={mousePos} />
              )}
              {/* War plan annotations */}
              <AnnotationOverlay
                arrows={arrows}
                drawings={drawings}
                labels={mapLabels}
                selectedId={annotationSelectedId}
                isDraggable={isOfficerMode && annotationTool === 'select'}
                stage={currentStage}
                onClickItem={(type, id) => {
                  if (annotationTool === 'eraser') {
                    handleDeleteAnnotation(id);
                  } else {
                    handleAnnotationClick(type, id);
                  }
                }}
                onLabelDragEnd={handleLabelDragEnd}
                liveDrawingPoints={liveDrawingPoints.length > 0 ? liveDrawingPoints : undefined}
                liveDrawingColor={annotationColor}
                liveDrawingWeight={3}
                liveArrowPoints={liveArrowPoints.length > 0 ? liveArrowPoints : undefined}
                liveArrowColor={getArrowColor(annotationArrowType)}
                cursorPoint={mousePos}
                pendingLabel={pendingLabel}
                onPendingLabelConfirm={handlePendingLabelConfirm}
                onPendingLabelCancel={handlePendingLabelCancel}
              />
            </MapBase>
            <CoordinateDisplay x={mousePos?.x ?? null} y={mousePos?.y ?? null} />

            {/* Unified status bar — only one mode hint visible at a time */}
            {annotationTool === 'arrow' && liveArrowPoints.length > 0 ? (
              <StatusBar color={getArrowColor(annotationArrowType)}>
                Click to set end point · Esc to cancel
              </StatusBar>
            ) : isDrawingZone && selectedZone ? (
              <StatusBar color={selectedZone.color}>
                Drawing: {selectedZone.name || `Zone ${selectedZone.zone_number}`} — {zoneVertices.length} vertices (double-click to finish, Esc to cancel)
              </StatusBar>
            ) : placement.isPlacing && placement.placingType ? (
              <StatusBar color={FEATURE_TYPE_CONFIG[placement.placingType].color}>
                <span>Placing: {FEATURE_TYPE_CONFIG[placement.placingType].label}</span>
                {isFlagFeatureType(placement.placingType) && alliances.length > 0 && (
                  <select
                    value={placement.placingForAllianceId || ''}
                    onChange={(e) => placement.setPlacingForAllianceId(e.target.value || null)}
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
                <span style={{ color: 'var(--text-muted)' }}>(click to place · Esc to stop)</span>
              </StatusBar>
            ) : rssState.rssAnnotationMode === 'annotate' ? (
              <StatusBar color={RSS_TYPE_COLORS[rssState.activeRssType]}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[rssState.activeRssType] }} />
                <span>Placing: {RSS_TYPE_LABELS[rssState.activeRssType]}</span>
                <span style={{ color: 'var(--text-muted)' }}>(click map to place · Esc to stop)</span>
              </StatusBar>
            ) : flagPath.active ? (
              <StatusBar color="#06b6d4">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#06b6d4' }} />
                <span>
                  {flagPath.addingWaypoint
                    ? 'Click to place waypoints'
                    : flagPath.addingFlag
                      ? 'Click to place a flag'
                      : `Flag Path: ${flagPath.flags.length} flags`}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>(Esc to exit)</span>
              </StatusBar>
            ) : isOfficerZoneFocus && selectedZone && !placement.isPlacing ? (
              <StatusBar color={selectedZone.color}>
                <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: selectedZone.color }} />
                <span>{selectedZone.name || `Zone ${selectedZone.zone_number}`}</span>
                <span style={{ color: 'var(--text-muted)' }}>(Esc to clear)</span>
              </StatusBar>
            ) : null}
          </div>

          {/* Right sidebar with panel stacking */}
          <RightSidebar
            visible={isOfficerMode || !!selectedZone || !!selectedFeature || rssState.rssReviewActive || flagPath.active || warPlanOpen || (!rssState.rssReviewActive && !!selectedRssNode && isAtLeast('officer'))}
            basePanelLabel={warPlanOpen ? 'War Plan' : flagPath.active ? 'Flag Path' : rssState.rssReviewActive ? 'RSS Review' : 'Overview'}
            onClearOverlay={() => {
              selection.setSelectedFeatureId(null);
              selection.setSelectedZoneId(null);
              selection.setSelectedRssNodeId(null);
            }}
            overlayPanel={
              // Overlay panels: feature/zone/rss node detail (shown on top of base)
              selectedFeature ? (
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
                  onClose={() => selection.setSelectedFeatureId(null)}
                />
              ) : selectedZone && isAdminMode ? (
                <ZoneEditorPanel
                  zone={selectedZone}
                  isDrawing={isDrawingZone}
                  vertexCount={zoneVertices.length}
                  onStartDrawing={handleStartDrawing}
                  onUndoVertex={handleUndoVertex}
                  onFinishDrawing={handleFinishDrawing}
                  onCancelDrawing={handleCancelDrawing}
                  onClose={() => {
                    selection.setSelectedZoneId(null);
                    setIsDrawingZone(false);
                    setZoneVertices([]);
                  }}
                />
              ) : selectedZone && !isAdminMode ? (
                <ZonePlanPanel
                  zone={selectedZone}
                  features={features}
                  assignments={activeAssignments}
                  alliances={alliances}
                  rssNodes={rssNodes}
                  onPlaceFortress={isOfficerMode ? handlePlaceFortress : undefined}
                  onPlaceFlag={isOfficerMode ? handlePlaceFlag : undefined}
                  isPlacingFortress={placement.isPlacing && placement.placingType === 'fortress'}
                  isPlacingFlag={placement.isPlacing && placement.placingType === 'flag'}
                  onSelectFeature={(id) => {
                    selection.setSelectedFeatureId(id);
                    selection.setSelectedZoneId(null);
                  }}
                  onClearFocus={() => selection.setSelectedZoneId(null)}
                  onUpdateKingdom={isOfficerMode ? async (kingdom) => {
                    const ok = await updateMapZone(selectedZone.id, { kingdom });
                    if (ok) refetchZones();
                  } : undefined}
                />
              ) : !rssState.rssReviewActive && selectedRssNode && isAtLeast('officer') ? (
                <div
                  className="rounded-xl p-4 border"
                  style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RSS_TYPE_COLORS[selectedRssNode.type] }} />
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                        {RSS_TYPE_LABELS[selectedRssNode.type]}
                      </h3>
                    </div>
                    <button
                      onClick={() => selection.setSelectedRssNodeId(null)}
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Close
                    </button>
                  </div>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    ({selectedRssNode.x}, {selectedRssNode.y})
                  </p>
                  {rssFlags.some((f) => f.node_x === selectedRssNode.x && f.node_y === selectedRssNode.y) ? (
                    <div
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-center"
                      style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                    >
                      Already flagged
                    </div>
                  ) : (
                    <button
                      onClick={handleFlagRssNode}
                      className="w-full px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        backgroundColor: 'rgba(239,68,68,0.15)',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.3)',
                      }}
                    >
                      Flag as Incorrect
                    </button>
                  )}
                </div>
              ) : null
            }
            basePanel={
              // Base panels: war plan, flag path, rss review, or allocation overview
              warPlanOpen && !flagPath.active && !rssState.rssReviewActive ? (
                <AnnotationPanel
                  arrows={arrows}
                  drawings={drawings}
                  labels={mapLabels}
                  notes={zoneNotes}
                  actions={zoneActions}
                  zones={zones}
                  stage={currentStage}
                  selectedId={annotationSelectedId}
                  onSelectItem={handleAnnotationClick}
                  onDeleteArrow={async (id) => { await deleteArrow(id); await refetchArrows(); if (annotationSelectedId === id) setAnnotationSelectedId(null); }}
                  onDeleteDrawing={async (id) => { await deleteDrawing(id); await refetchDrawings(); if (annotationSelectedId === id) setAnnotationSelectedId(null); }}
                  onDeleteLabel={async (id) => { await deleteLabel(id); await refetchLabels(); if (annotationSelectedId === id) setAnnotationSelectedId(null); }}
                  onSaveNote={handleSaveNote}
                  onToggleAction={handleToggleAction}
                  onCreateAction={handleCreateAction}
                  onDeleteAction={handleDeleteAction}
                  onClose={handleToggleWarPlan}
                  activeTool={annotationTool}
                  onToolChange={handleAnnotationToolChange}
                  arrowType={annotationArrowType}
                  onArrowTypeChange={setAnnotationArrowType}
                  drawColor={annotationColor}
                  onDrawColorChange={setAnnotationColor}
                />
              ) : flagPath.active ? (
                <FlagPathPanel
                  waypoints={flagPath.waypoints}
                  flags={flagPath.flags}
                  result={flagPath.result}
                  config={flagPath.config}
                  isAddingWaypoint={flagPath.addingWaypoint}
                  isAddingFlag={flagPath.addingFlag}
                  selectedFlagId={flagPath.selectedFlagId}
                  calculating={flagPath.calculating}
                  onConfigChange={flagPath.configChange}
                  onCalculate={() => flagPath.calculate(rssNodes)}
                  onRemoveWaypoint={flagPath.removeWaypoint}
                  onClearWaypoints={flagPath.clearWaypoints}
                  onToggleAddWaypoint={flagPath.toggleAddWaypoint}
                  onToggleAddFlag={flagPath.toggleAddFlag}
                  onFlagStatusChange={flagPath.flagStatusChange}
                  onFlagDelete={(id) => flagPath.flagDelete(id, rssNodes)}
                  onSelectFlag={flagPath.setSelectedFlagId}
                  onClose={handleToggleFlagPath}
                  alliances={alliances}
                  onApply={handleApplyFlagPath}
                />
              ) : rssState.rssReviewActive ? (
                <>
                  <button
                    onClick={handleRssSaveToServer}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: 'rgba(59,130,246,0.15)',
                      color: '#3b82f6',
                      border: '1px solid rgba(59,130,246,0.3)',
                    }}
                  >
                    Save to Server
                  </button>
                  <RssReviewPanel
                    nodes={rssNodes}
                    selectedId={selection.selectedRssNodeId}
                    typeFilter={rssState.rssTypeFilter}
                    statusFilter={rssState.rssStatusFilter}
                    onTypeFilterChange={rssState.setRssTypeFilter}
                    onStatusFilterChange={rssState.setRssStatusFilter}
                    onChangeType={handleRssNodeChangeType}
                    onApprove={handleRssNodeApprove}
                    onReject={handleRssNodeReject}
                    onDelete={handleRssNodeDelete}
                    onSelect={selection.setSelectedRssNodeId}
                    onExport={handleRssExport}
                    onClose={handleToggleRssReview}
                    onFlyTo={rssState.flyTo}
                    annotationMode={rssState.rssAnnotationMode}
                    onAnnotationModeChange={rssState.setRssAnnotationMode}
                    activeRssType={rssState.activeRssType}
                    onActiveRssTypeChange={rssState.setActiveRssType}
                    sourceCount={rssSourceCount}
                    detectedCount={rssDetectedCount}
                    canUndo={rssState.rssUndoStack.length > 0}
                    onDetect={handleRssDetect}
                    detecting={rssState.rssDetecting}
                    detectProgress={rssState.rssDetectProgress}
                    onClearDetected={handleRssClearDetected}
                    onStartFresh={handleRssStartFresh}
                    onUndo={handleRssUndo}
                    onLoadExisting={handleRssLoadExisting}
                    onBatchChangeType={handleRssBatchChangeType}
                    onReclassify={handleRssReclassify}
                    reclassifying={rssState.rssReclassifying}
                    onBulkApprove={handleRssBulkApprove}
                    onBulkReject={handleRssBulkReject}
                  />
                </>
              ) : isOfficerMode ? (
                <AllocationPlanPanel
                  features={features}
                  assignments={activeAssignments}
                  alliances={alliances}
                  targets={allocationTargets}
                  onUpsertTarget={handleUpsertTarget}
                  onDeleteTarget={handleDeleteTarget}
                  zones={zones}
                  onFocusZone={selection.setSelectedZoneId}
                  currentStage={map?.current_stage ?? 1}
                  onStageChange={handleStageChange}
                />
              ) : null
            }
          />
        </div>

        {/* Bottom panel: Achievement Progress (all users — viewers see no progress) */}
        <AchievementProgressPanel
          features={features}
          assignments={isOfficerMode ? activeAssignments : []}
          alliances={isOfficerMode ? alliances : []}
          rssNodes={rssNodes}
          collapsed={!bottomPanelOpen}
          onToggle={() => setBottomPanelOpen((v) => !v)}
        />
      </div>
    </div>
  );
}
