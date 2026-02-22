'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import MapBase from '@/components/kvk-map/MapBase';
import FeatureMarker from '@/components/kvk-map/FeatureMarker';
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
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';

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
  const [showZones, setShowZones] = useState(true);

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

  // ── Feature handlers ─────────────────────────────────────────────

  const handleSelectType = useCallback((type: FeatureType) => {
    setPlacingType(type);
    setIsPlacing(true);
    setSelectedFeatureId(null);
    setSelectedZoneId(null);
    setIsDrawingZone(false);
    setZoneVertices([]);
  }, []);

  const handleCancelPlacement = useCallback(() => {
    setPlacingType(null);
    setIsPlacing(false);
  }, []);

  const handleFeatureClick = useCallback(
    (feature: KvkMapFeature) => {
      if (isPlacing || isDrawingZone) return;
      setSelectedFeatureId(feature.id);
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
      setSelectedZoneId(zone.id);
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
            <ZoneLabel key={`label-${zone.id}`} zone={zone} />
          ))}
          {features.map((feature) => (
            <FeatureMarker
              key={feature.id}
              feature={feature}
              isSelected={feature.id === selectedFeatureId}
              isDraggable={!isPlacing && !isDrawingZone}
              onClick={handleFeatureClick}
              onDragEnd={handleFeatureDragEnd}
            />
          ))}
          {isDrawingZone && (
            <DrawingOverlay vertices={zoneVertices} currentPoint={mousePos} />
          )}
        </MapBase>
        <CoordinateDisplay x={mousePos?.x ?? null} y={mousePos?.y ?? null} />

        {/* Zone toggle */}
        <button
          onClick={() => setShowZones((v) => !v)}
          className="absolute bottom-2 right-2 z-[1000] px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
          style={{
            backgroundColor: showZones ? 'rgba(59,130,246,0.2)' : 'rgba(0,0,0,0.6)',
            color: showZones ? '#60a5fa' : '#9ca3af',
            border: '1px solid var(--border)',
          }}
        >
          {showZones ? 'Zones ON' : 'Zones OFF'}
        </button>

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
