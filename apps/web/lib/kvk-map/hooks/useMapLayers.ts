import { useState, useMemo, useCallback } from 'react';
import { FEATURE_GROUPS } from '@/lib/kvk-feature-config';

export interface MapLayersState {
  hiddenGroups: Set<string>;
  allHidden: boolean;
  showZones: boolean;
  toggleGroup: (groupKey: string) => void;
  toggleAll: () => void;
  ensureVisible: (groupKey: string) => void;
}

const allGroupKeys = ['zones', ...FEATURE_GROUPS.map((g) => g.key)];

export function useMapLayers(): MapLayersState {
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

  const allHidden = useMemo(
    () => allGroupKeys.every((k) => hiddenGroups.has(k)),
    [hiddenGroups],
  );

  const showZones = !hiddenGroups.has('zones');

  const toggleGroup = useCallback((groupKey: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setHiddenGroups((prev) => {
      const allCurrentlyHidden = allGroupKeys.every((k) => prev.has(k));
      return allCurrentlyHidden ? new Set() : new Set(allGroupKeys);
    });
  }, []);

  const ensureVisible = useCallback((groupKey: string) => {
    setHiddenGroups((prev) => {
      if (!prev.has(groupKey)) return prev;
      const next = new Set(prev);
      next.delete(groupKey);
      return next;
    });
  }, []);

  return {
    hiddenGroups,
    allHidden,
    showZones,
    toggleGroup,
    toggleAll,
    ensureVisible,
  };
}
