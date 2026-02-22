'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import MapBase from '@/components/kvk-map/MapBase';
import FeatureMarker from '@/components/kvk-map/FeatureMarker';
import ZonePolygon from '@/components/kvk-map/ZonePolygon';
import ZoneLabel from '@/components/kvk-map/ZoneLabel';
import DrawingOverlay from '@/components/kvk-map/DrawingOverlay';
import CoordinateDisplay from '@/components/kvk-map/CoordinateDisplay';
import FeaturePalette from '@/components/kvk-map/admin/FeaturePalette';
import ZoneEditorPanel from '@/components/kvk-map/admin/ZoneEditorPanel';
import WarRoomHeader from './WarRoomHeader';
import AllianceList from './AllianceList';
import FeatureDetailPanel from './FeatureDetailPanel';
import AchievementSidebar from './AchievementSidebar';
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
import { useKvkAlliances, createAlliance, updateAlliance, deleteAlliance, fetchTopAlliancesFromRoster } from '@/lib/supabase/use-kvk-alliances';
import { useKvkAssignments, upsertAssignment, updateAssignment, deleteAssignment } from '@/lib/supabase/use-kvk-assignments';
import { useKvkStrategies, saveStrategy, loadStrategyByShareCode, deleteStrategy } from '@/lib/supabase/use-kvk-strategies';
import type { FeatureType, KvkMapFeature, KvkMapZone, KvkAssignment, AssignmentStatus } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG, FEATURE_TYPE_TO_GROUP, FEATURE_GROUPS } from '@/lib/kvk-feature-config';

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
  const autoPopulatedRef = useRef(false);
  useEffect(() => {
    if (!map?.id || alliancesLoading || alliances.length > 0 || autoPopulatedRef.current) return;
    autoPopulatedRef.current = true;
    (async () => {
      const topAlliances = await fetchTopAlliancesFromRoster(3);
      for (let i = 0; i < topAlliances.length; i++) {
        await createAlliance(map.id, { ...topAlliances[i], sort_order: i });
      }
      if (topAlliances.length > 0) await refetchAlliances();
    })();
  }, [map?.id, alliancesLoading, alliances.length, refetchAlliances]);

  const activeAssignments = strategyAssignments ?? assignments;

  // ── Feature UI state ───────────────────────────────────────────────
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<FeatureType | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(-1);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

  // ── Zone hover state (for marker → zone highlight) ────────────────
  const [hoveredZoneNumber, setHoveredZoneNumber] = useState<number | null>(null);

  // ── Zone editing state ─────────────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [zoneVertices, setZoneVertices] = useState<[number, number][]>([]);

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

  // ── Escape key ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawingZone) {
          setIsDrawingZone(false);
          setZoneVertices([]);
          return;
        }
        setPlacingType(null);
        setIsPlacing(false);
        setSelectedFeatureId(null);
        setSelectedZoneId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingZone]);

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

  // ── Feature handlers (admin only) ──────────────────────────────────
  const handleSelectType = useCallback((type: FeatureType) => {
    if (!isAtLeast('admin')) return;
    setPlacingType(type);
    setIsPlacing(true);
    setSelectedFeatureId(null);
    setSelectedZoneId(null);
    setIsDrawingZone(false);
    setZoneVertices([]);
    const group = FEATURE_TYPE_TO_GROUP[type];
    if (group) {
      setHiddenGroups((prev) => {
        if (!prev.has(group)) return prev;
        const next = new Set(prev);
        next.delete(group);
        return next;
      });
    }
  }, [isAtLeast]);

  const handleCancelPlacement = useCallback(() => {
    setPlacingType(null);
    setIsPlacing(false);
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
      if (!isAtLeast('admin')) return;
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
      if (!isPlacing || !placingType || !map || !isAtLeast('admin')) return;
      const sameType = features.filter((f) => f.feature_type === placingType);
      const lastOfType = sameType[sameType.length - 1];
      const config = FEATURE_TYPE_CONFIG[placingType];
      const defaults = {
        level: lastOfType?.level ?? config.defaultLevel,
        zone: lastOfType?.zone ?? null,
      };
      const newFeature = await createMapFeature(map.id, placingType, x, y, defaults);
      if (newFeature) {
        await refetchFeatures();
        setSelectedFeatureId(newFeature.id);
      }
    },
    [isDrawingZone, isPlacing, placingType, map, features, refetchFeatures, isAtLeast]
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

  const isAdminMode = isAtLeast('admin');

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

      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)]">
        {/* Left sidebar */}
        <div className="lg:w-56 shrink-0 overflow-y-auto space-y-3">
          <AllianceList
            alliances={alliances}
            onCreate={handleCreateAlliance}
            onUpdate={handleUpdateAlliance}
            onDelete={handleDeleteAlliance}
          />
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
          />
        </div>

        {/* Center: Map */}
        <div
          className="flex-1 relative rounded-xl overflow-hidden border min-h-[400px]"
          style={{ borderColor: 'var(--border)' }}
        >
          <MapBase
            imageUrl={map.image_path}
            imageWidth={map.image_width}
            imageHeight={map.image_height}
            onClick={handleMapClick}
            onDoubleClick={handleMapDoubleClick}
            onMouseMove={handleMouseMove}
            onZoomChange={setZoom}
            cursorStyle={(isPlacing || isDrawingZone) && isAdminMode ? 'crosshair' : undefined}
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
              const assignment = assignmentMap.get(feature.id);
              const alliance = assignment ? allianceMap.get(assignment.alliance_id) : undefined;
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
            {isDrawingZone && (
              <DrawingOverlay vertices={zoneVertices} currentPoint={mousePos} />
            )}
          </MapBase>
          <CoordinateDisplay x={mousePos?.x ?? null} y={mousePos?.y ?? null} />

          {/* Mode indicator */}
          {isPlacing && placingType && isAdminMode && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'rgba(0,0,0,0.8)',
                color: FEATURE_TYPE_CONFIG[placingType].color,
                border: '1px solid var(--border)',
              }}
            >
              Placing: {FEATURE_TYPE_CONFIG[placingType].label} (click map to place, Esc to cancel)
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
        </div>

        {/* Right sidebar */}
        <div className="lg:w-72 shrink-0 overflow-y-auto">
          {selectedZone ? (
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
              assignment={selectedAssignment}
              alliance={selectedAlliance}
              alliances={alliances}
              onSave={isAdminMode ? handleSaveFeature : undefined}
              onDelete={isAdminMode ? handleDeleteFeature : undefined}
              onAssign={isAtLeast('officer') ? handleAssign : undefined}
              onUpdateAssignment={isAtLeast('officer') ? handleUpdateAssignment : undefined}
              onUnassign={isAtLeast('officer') ? handleUnassign : undefined}
              onClose={() => setSelectedFeatureId(null)}
            />
          ) : (
            <AchievementSidebar />
          )}
        </div>
      </div>
    </div>
  );
}
