import { useState, useCallback } from 'react';
import type { FeatureType } from '@/lib/kvk-map-types';

export interface MapPlacementState {
  placingType: FeatureType | null;
  isPlacing: boolean;
  placingForAllianceId: string | null;
  setPlacingForAllianceId: (id: string | null) => void;
  startPlacement: (type: FeatureType, allianceId?: string | null) => void;
  cancelPlacement: () => void;
}

export function useMapPlacement(): MapPlacementState {
  const [placingType, setPlacingType] = useState<FeatureType | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [placingForAllianceId, setPlacingForAllianceId] = useState<string | null>(null);

  const startPlacement = useCallback((type: FeatureType, allianceId?: string | null) => {
    setPlacingType(type);
    setIsPlacing(true);
    setPlacingForAllianceId(allianceId ?? null);
  }, []);

  const cancelPlacement = useCallback(() => {
    setPlacingType(null);
    setIsPlacing(false);
    setPlacingForAllianceId(null);
  }, []);

  return {
    placingType,
    isPlacing,
    placingForAllianceId,
    setPlacingForAllianceId,
    startPlacement,
    cancelPlacement,
  };
}
