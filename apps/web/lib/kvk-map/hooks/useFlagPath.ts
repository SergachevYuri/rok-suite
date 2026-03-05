import { useState, useCallback } from 'react';
import type { RssNode } from '@/lib/kvk-map/rss-review';
import {
  type Waypoint, type PlannedFlag, type PlannedFlagStatus,
  type FlagPathConfig, type FlagPathResult,
  DEFAULT_FLAG_STEP, DEFAULT_MAX_DEVIATION,
  computeFlagPath, recalculateCoverage,
} from '@/lib/kvk-map/flag-path';

export interface FlagPathState {
  active: boolean;
  waypoints: Waypoint[];
  flags: PlannedFlag[];
  result: FlagPathResult | null;
  config: FlagPathConfig;
  addingWaypoint: boolean;
  addingFlag: boolean;
  selectedFlagId: string | null;
  calculating: boolean;

  setActive: (v: boolean) => void;
  setAddingWaypoint: (v: boolean) => void;
  setAddingFlag: (v: boolean) => void;
  setSelectedFlagId: (id: string | null) => void;

  toggle: () => void;
  clear: () => void;
  addWaypoint: (x: number, y: number) => void;
  removeWaypoint: (id: string) => void;
  clearWaypoints: () => void;
  waypointDragEnd: (id: string, newX: number, newY: number) => void;
  toggleAddWaypoint: () => void;
  toggleAddFlag: () => void;
  addFlagManual: (x: number, y: number, rssNodes: RssNode[]) => void;
  flagStatusChange: (id: string, status: PlannedFlagStatus) => void;
  flagDelete: (id: string, rssNodes: RssNode[]) => void;
  flagDragEnd: (id: string, newX: number, newY: number, rssNodes: RssNode[]) => void;
  configChange: (updates: Partial<FlagPathConfig>) => void;
  calculate: (rssNodes: RssNode[]) => Promise<void>;
}

export function useFlagPath(): FlagPathState {
  const [active, setActive] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [flags, setFlags] = useState<PlannedFlag[]>([]);
  const [result, setResult] = useState<FlagPathResult | null>(null);
  const [config, setConfig] = useState<FlagPathConfig>({
    flagStep: DEFAULT_FLAG_STEP,
    maxDeviation: DEFAULT_MAX_DEVIATION,
  });
  const [addingWaypoint, setAddingWaypoint] = useState(false);
  const [addingFlag, setAddingFlag] = useState(false);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const clear = useCallback(() => {
    setActive(false);
    setWaypoints([]);
    setFlags([]);
    setResult(null);
    setAddingWaypoint(false);
    setAddingFlag(false);
    setSelectedFlagId(null);
  }, []);

  const toggle = useCallback(() => {
    if (!active) {
      setActive(true);
      setAddingWaypoint(true);
      setWaypoints([]);
      setFlags([]);
      setResult(null);
      setSelectedFlagId(null);
    } else {
      clear();
    }
  }, [active, clear]);

  const addWaypoint = useCallback((x: number, y: number) => {
    const wp: Waypoint = { id: crypto.randomUUID(), x: Math.round(x), y: Math.round(y) };
    setWaypoints((prev) => [...prev, wp]);
  }, []);

  const removeWaypoint = useCallback((id: string) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
    setResult(null);
    setFlags([]);
  }, []);

  const clearWaypoints = useCallback(() => {
    setWaypoints([]);
    setFlags([]);
    setResult(null);
  }, []);

  const waypointDragEnd = useCallback((id: string, newX: number, newY: number) => {
    setWaypoints((prev) =>
      prev.map((w) => (w.id === id ? { ...w, x: newX, y: newY } : w)),
    );
    setResult(null);
    setFlags([]);
  }, []);

  const toggleAddWaypoint = useCallback(() => {
    setAddingWaypoint((v) => !v);
    setAddingFlag(false);
  }, []);

  const toggleAddFlag = useCallback(() => {
    setAddingFlag((v) => !v);
    setAddingWaypoint(false);
  }, []);

  const addFlagManual = useCallback((x: number, y: number, rssNodes: RssNode[]) => {
    const newFlag: PlannedFlag = {
      id: crypto.randomUUID(),
      x: Math.round(x),
      y: Math.round(y),
      status: 'planned',
      coveredNodeIds: [],
      rssPerHour: 0,
    };
    setFlags((prev) => {
      const updated = [...prev, newFlag];
      const r = recalculateCoverage(updated, rssNodes);
      setResult(r);
      return r.flags;
    });
    setAddingFlag(false);
  }, []);

  const flagStatusChange = useCallback((id: string, status: PlannedFlagStatus) => {
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }, []);

  const flagDelete = useCallback((id: string, rssNodes: RssNode[]) => {
    setFlags((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      if (updated.length > 0) {
        const r = recalculateCoverage(updated, rssNodes);
        setResult(r);
        return r.flags;
      }
      setResult(null);
      return [];
    });
    setSelectedFlagId((prev) => (prev === id ? null : prev));
  }, []);

  const flagDragEnd = useCallback((id: string, newX: number, newY: number, rssNodes: RssNode[]) => {
    setFlags((prev) => {
      const updated = prev.map((f) => (f.id === id ? { ...f, x: newX, y: newY } : f));
      const r = recalculateCoverage(updated, rssNodes);
      setResult(r);
      return r.flags;
    });
  }, []);

  const configChange = useCallback((updates: Partial<FlagPathConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setResult(null);
    setFlags([]);
  }, []);

  const calculate = useCallback(async (rssNodes: RssNode[]) => {
    if (waypoints.length < 2 || calculating) return;
    setCalculating(true);
    await new Promise((r) => setTimeout(r, 0));
    try {
      const r = computeFlagPath(waypoints, rssNodes, config);
      setFlags(r.flags);
      setResult(r);
      setAddingWaypoint(false);
    } finally {
      setCalculating(false);
    }
  }, [waypoints, config, calculating]);

  return {
    active, waypoints, flags, result, config,
    addingWaypoint, addingFlag, selectedFlagId, calculating,
    setActive, setAddingWaypoint, setAddingFlag, setSelectedFlagId,
    toggle, clear, addWaypoint, removeWaypoint, clearWaypoints,
    waypointDragEnd, toggleAddWaypoint, toggleAddFlag,
    addFlagManual, flagStatusChange, flagDelete, flagDragEnd,
    configChange, calculate,
  };
}
