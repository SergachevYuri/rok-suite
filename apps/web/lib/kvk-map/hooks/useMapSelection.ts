import { useState, useCallback } from 'react';

export interface MapSelectionState {
  selectedFeatureId: string | null;
  selectedZoneId: string | null;
  selectedRssNodeId: number | null;
  hoveredZoneNumber: number | null;
  setSelectedFeatureId: (id: string | null) => void;
  setSelectedZoneId: (id: string | null) => void;
  setSelectedRssNodeId: (id: number | null) => void;
  setHoveredZoneNumber: (zone: number | null) => void;
  clearSelection: () => void;
}

export function useMapSelection(): MapSelectionState {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRssNodeId, setSelectedRssNodeId] = useState<number | null>(null);
  const [hoveredZoneNumber, setHoveredZoneNumber] = useState<number | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedFeatureId(null);
    setSelectedZoneId(null);
    setSelectedRssNodeId(null);
  }, []);

  return {
    selectedFeatureId,
    selectedZoneId,
    selectedRssNodeId,
    hoveredZoneNumber,
    setSelectedFeatureId,
    setSelectedZoneId,
    setSelectedRssNodeId,
    setHoveredZoneNumber,
    clearSelection,
  };
}
