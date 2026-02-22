'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import MapBase from '@/components/kvk-map/MapBase';
import FeatureMarker from '@/components/kvk-map/FeatureMarker';
import CoordinateDisplay from '@/components/kvk-map/CoordinateDisplay';
import FeaturePalette from './FeaturePalette';
import FeatureEditorPanel from './FeatureEditorPanel';
import {
  useActiveKvkMap,
  useKvkMapFeatures,
  createMapFeature,
  updateMapFeature,
  deleteMapFeature,
  updateFeaturePosition,
} from '@/lib/supabase/use-kvk-map';
import type { FeatureType, KvkMapFeature } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';

export default function AdminMapView() {
  // Data
  const { map, loading: mapLoading } = useActiveKvkMap();
  const { features, loading: featuresLoading, refetch } = useKvkMapFeatures(map?.id);

  // UI state
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<FeatureType | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId) || null,
    [features, selectedFeatureId]
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
        setPlacingType(null);
        setIsPlacing(false);
        setSelectedFeatureId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handlers
  const handleSelectType = useCallback((type: FeatureType) => {
    setPlacingType(type);
    setIsPlacing(true);
    setSelectedFeatureId(null);
  }, []);

  const handleCancelPlacement = useCallback(() => {
    setPlacingType(null);
    setIsPlacing(false);
  }, []);

  const handleMouseMove = useCallback((x: number, y: number) => {
    setMousePos({ x, y });
  }, []);

  const handleMapClick = useCallback(
    async (x: number, y: number) => {
      if (!isPlacing || !placingType || !map) return;

      const newFeature = await createMapFeature(map.id, placingType, x, y);
      if (newFeature) {
        await refetch();
        setSelectedFeatureId(newFeature.id);
        // Stay in placement mode for placing multiple features
      }
    },
    [isPlacing, placingType, map, refetch]
  );

  const handleFeatureClick = useCallback(
    (feature: KvkMapFeature) => {
      if (isPlacing) return;
      setSelectedFeatureId(feature.id);
    },
    [isPlacing]
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

  // Loading state
  if (mapLoading || featuresLoading) {
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
          onMouseMove={handleMouseMove}
        >
          {features.map((feature) => (
            <FeatureMarker
              key={feature.id}
              feature={feature}
              isSelected={feature.id === selectedFeatureId}
              isDraggable={!isPlacing}
              onClick={handleFeatureClick}
              onDragEnd={handleFeatureDragEnd}
            />
          ))}
        </MapBase>
        <CoordinateDisplay x={mousePos?.x ?? null} y={mousePos?.y ?? null} />

        {/* Placement mode indicator */}
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
      </div>

      {/* Right sidebar: Feature editor */}
      <div className="lg:w-72 shrink-0 overflow-y-auto">
        {selectedFeature ? (
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
                : features.length === 0
                  ? 'Select a feature type from the palette, then click the map'
                  : 'Click a marker to edit its details'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
