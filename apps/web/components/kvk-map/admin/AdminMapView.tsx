'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import MapBase from '@/components/kvk-map/MapBase';
import FeatureMarker from '@/components/kvk-map/FeatureMarker';
import FlagOverlay from '@/components/kvk-map/FlagOverlay';
import ZonePolygon from '@/components/kvk-map/ZonePolygon';
import ZoneLabel from '@/components/kvk-map/ZoneLabel';
import DrawingOverlay from '@/components/kvk-map/DrawingOverlay';
import CoordinateDisplay from '@/components/kvk-map/CoordinateDisplay';
import FeaturePalette from './FeaturePalette';
import FeatureEditorPanel from './FeatureEditorPanel';
import ZoneEditorPanel from './ZoneEditorPanel';
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
import type { FeatureType, KvkMapFeature, KvkMapZone } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG, FEATURE_TYPE_TO_GROUP, FEATURE_GROUPS } from '@/lib/kvk-feature-config';

export default function AdminMapView() {
  // Data
  const { map, loading: mapLoading } = useActiveKvkMap();
  const { features, refetch } = useKvkMapFeatures(map?.id);
  const { zones, refetch: refetchZones } = useKvkMapZones(map?.id);

  // Feature UI state
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<FeatureType | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(-1);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

  // Zone editing state
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [zoneVertices, setZoneVertices] = useState<[number, number][]>([]);

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId) || null,
    [features, selectedFeatureId]
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

  // Escape key handler
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

  const handleToggleGroup = useCallback((groupKey: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setHiddenGroups((prev) => {
      const allCurrentlyHidden = allGroupKeys.every((k) => prev.has(k));
      return allCurrentlyHidden ? new Set() : new Set(allGroupKeys);
    });
  }, [allGroupKeys]);

  // ── Feature handlers ─────────────────────────────────────────────

  const handleSelectType = useCallback((type: FeatureType) => {
    setPlacingType(type);
    setIsPlacing(true);
    setSelectedFeatureId(null);
    setSelectedZoneId(null);
    setIsDrawingZone(false);
    setZoneVertices([]);
    // Auto-show the group if it's hidden
    const group = FEATURE_TYPE_TO_GROUP[type];
    if (group) {
      setHiddenGroups((prev) => {
        if (!prev.has(group)) return prev;
        const next = new Set(prev);
        next.delete(group);
        return next;
      });
    }
  }, []);

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

  const handleFeatureDragEnd = useCallback(
    async (feature: KvkMapFeature, newX: number, newY: number) => {
      await updateFeaturePosition(feature.id, newX, newY);
      await refetch();
    },
    [refetch]
  );

  const handleSaveFeature = useCallback(
    async (featureId: string, updates: Partial<KvkMapFeature>) => {
      await updateMapFeature(featureId, updates);
      await refetch();
    },
    [refetch]
  );

  const handleDeleteFeature = useCallback(
    async (featureId: string) => {
      await deleteMapFeature(featureId);
      setSelectedFeatureId(null);
      await refetch();
    },
    [refetch]
  );

  // ── Zone handlers ────────────────────────────────────────────────

  const handleZoneClick = useCallback(
    (zone: KvkMapZone) => {
      if (isPlacing || isDrawingZone) return;
      setSelectedZoneId((prev) => (prev === zone.id ? null : zone.id));
      setSelectedFeatureId(null);
    },
    [isPlacing, isDrawingZone]
  );

  const handleStartDrawing = useCallback(() => {
    setIsDrawingZone(true);
    setZoneVertices([]);
    setIsPlacing(false);
    setPlacingType(null);
  }, []);

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

  // ── Map click/move handlers ──────────────────────────────────────

  const handleMouseMove = useCallback((x: number, y: number) => {
    setMousePos({ x, y });
  }, []);

  const handleMapClick = useCallback(
    async (x: number, y: number) => {
      // Zone drawing mode: add vertex
      if (isDrawingZone) {
        setZoneVertices((prev) => [...prev, [x, y]]);
        return;
      }

      // Feature placement mode
      if (!isPlacing || !placingType || !map) return;

      const sameType = features.filter((f) => f.feature_type === placingType);
      const lastOfType = sameType[sameType.length - 1];
      const config = FEATURE_TYPE_CONFIG[placingType];
      const defaults = {
        level: lastOfType?.level ?? config.defaultLevel,
        zone: lastOfType?.zone ?? null,
      };

      const newFeature = await createMapFeature(map.id, placingType, x, y, defaults);
      if (newFeature) {
        await refetch();
        setSelectedFeatureId(newFeature.id);
      }
    },
    [isDrawingZone, isPlacing, placingType, map, features, refetch]
  );

  const handleMapDoubleClick = useCallback(
    async (x: number, y: number) => {
      if (!isDrawingZone || !selectedZone) return;
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
    [isDrawingZone, zoneVertices, selectedZone, refetchZones]
  );

  // ── Render ───────────────────────────────────────────────────────

  if (mapLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-5 h-5 border border-[#4318ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!map) {
    return (
      <div
        className="text-center py-12"
        style={{ color: 'var(--text-muted)' }}
      >
        No active map found. Run the migration SQL to create one.
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-120px)]">
      {/* Left sidebar: Feature palette */}
      <div className="lg:w-56 shrink-0 overflow-y-auto">
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
        />
      </div>

      {/* Center: Map */}
      <div
        className="flex-1 relative rounded-xl overflow-hidden border min-h-[400px]"
        style={{ borderColor: 'var(--border)' }}
      >
        <MapBase
          imageUrl={map.image_path}
          onClick={handleMapClick}
          onDoubleClick={handleMapDoubleClick}
          onMouseMove={handleMouseMove}
          onZoomChange={setZoom}
          cursorStyle={isPlacing || isDrawingZone ? 'crosshair' : undefined}
        >
          {showZones && zones.map((zone) => (
            <ZonePolygon
              key={zone.id}
              zone={zone}
              onClick={handleZoneClick}
              isSelected={zone.id === selectedZoneId}
            />
          ))}
          {showZones && zones.map((zone) => (
            <ZoneLabel key={`label-${zone.id}`} zone={zone} zoom={zoom} />
          ))}
          {visibleFeatures.map((feature) => {
            const cfg = FEATURE_TYPE_CONFIG[feature.feature_type];
            if (cfg?.tileSize) {
              return (
                <FlagOverlay
                  key={feature.id}
                  feature={feature}
                  isSelected={feature.id === selectedFeatureId}
                  isDraggable={!isPlacing && !isDrawingZone}
                  zoom={zoom}
                  onClick={handleFeatureClick}
                  onDragEnd={handleFeatureDragEnd}
                />
              );
            }
            return (
              <FeatureMarker
                key={feature.id}
                feature={feature}
                isSelected={feature.id === selectedFeatureId}
                isDraggable={!isPlacing && !isDrawingZone}
                zoom={zoom}
                onClick={handleFeatureClick}
                onDragEnd={handleFeatureDragEnd}
              />
            );
          })}
          {isDrawingZone && (
            <DrawingOverlay vertices={zoneVertices} currentPoint={mousePos} />
          )}
        </MapBase>
        <CoordinateDisplay x={mousePos?.x ?? null} y={mousePos?.y ?? null} />

        {/* Mode indicator */}
        {isPlacing && placingType && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              color: FEATURE_TYPE_CONFIG[placingType].color,
              border: '1px solid var(--border)',
            }}
          >
            Placing: {FEATURE_TYPE_CONFIG[placingType].label} (click map to
            place, Esc to cancel)
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

      {/* Right sidebar: Zone editor or Feature editor */}
      <div className="lg:w-72 shrink-0 overflow-y-auto">
        {selectedZone ? (
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
        ) : selectedFeature ? (
          <FeatureEditorPanel
            feature={selectedFeature}
            onSave={handleSaveFeature}
            onDelete={handleDeleteFeature}
            onClose={() => setSelectedFeatureId(null)}
          />
        ) : (
          <div
            className="rounded-xl p-4 border text-center"
            style={{
              backgroundColor: 'var(--background-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <p className="text-sm">
              {isPlacing
                ? 'Click on the map to place a feature'
                : 'Click a marker to edit, or a zone to redraw its boundary'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
