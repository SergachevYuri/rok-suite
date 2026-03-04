'use client';

import { useMemo, memo } from 'react';
import { Polyline, CircleMarker, Rectangle, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Waypoint, PlannedFlag } from '@/lib/kvk-map/flag-path';
import { FLAG_HALF } from '@/lib/kvk-map/flag-path';
import { RSS_TYPE_COLORS, type RssNode } from '@/lib/kvk-map/rss-review';

interface FlagPathOverlayProps {
  waypoints: Waypoint[];
  flags: PlannedFlag[];
  rssNodes: RssNode[];
  coveredNodeIds: Set<number>;
  currentPoint?: { x: number; y: number } | null;
  isAddingWaypoint: boolean;
  isAddingFlag: boolean;
  zoom: number;
  selectedFlagId?: string | null;
  onWaypointDragEnd: (id: string, x: number, y: number) => void;
  onFlagDragEnd: (id: string, x: number, y: number) => void;
  onFlagClick: (id: string) => void;
}

// ── Draggable Waypoint Marker ────────────────────────────────────────
const DraggableWaypoint = memo(function DraggableWaypoint({
  wp,
  index,
  total,
  onDragEnd,
}: {
  wp: Waypoint;
  index: number;
  total: number;
  onDragEnd: (id: string, x: number, y: number) => void;
}) {
  const color = index === 0 ? '#22c55e' : index === total - 1 ? '#ef4444' : '#60a5fa';
  const label = index === 0 ? 'S' : index === total - 1 ? 'E' : `${index}`;

  const icon = useMemo(
    () =>
      new L.DivIcon({
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: `<div style="
          width: 20px; height: 20px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; color: #fff;
          cursor: grab; box-shadow: 0 0 4px rgba(0,0,0,0.5);
        ">${label}</div>`,
      }),
    [color, label],
  );

  return (
    <Marker
      position={[wp.y, wp.x]}
      icon={icon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const pos = e.target.getLatLng();
          onDragEnd(wp.id, Math.round(pos.lng), Math.round(pos.lat));
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -12]} opacity={0.9}>
        <span style={{ fontSize: '10px', fontWeight: 600 }}>
          {index === 0 ? 'Start' : index === total - 1 ? 'End' : `Waypoint ${index}`} ({wp.x}, {wp.y})
        </span>
      </Tooltip>
    </Marker>
  );
});

// ── Planned Flag Rectangle ──────────────────────────────────────────

const PlannedFlagRect = memo(function PlannedFlagRect({
  flag,
  isSelected,
  zoom,
  onClick,
  onDragEnd,
}: {
  flag: PlannedFlag;
  isSelected: boolean;
  zoom: number;
  onClick: () => void;
  onDragEnd: (id: string, x: number, y: number) => void;
}) {
  const isExisting = flag.status === 'existing';
  const color = isExisting ? '#22c55e' : '#06b6d4';

  const bounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [flag.y - FLAG_HALF, flag.x - FLAG_HALF],
      [flag.y + FLAG_HALF, flag.x + FLAG_HALF],
    ],
    [flag.x, flag.y],
  );

  const label = isExisting ? 'E' : 'P';
  const iconSize = 14 + (zoom + 2) * 2;
  const icon = useMemo(
    () =>
      new L.DivIcon({
        className: '',
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize / 2],
        html: `<div style="
          width: ${iconSize}px; height: ${iconSize}px;
          border-radius: 2px;
          background: rgba(0,0,0,0.6);
          border: 1px solid ${color};
          display: flex; align-items: center; justify-content: center;
          font-size: ${Math.max(8, Math.round(iconSize * 0.55))}px;
          font-weight: 700; color: ${color}; cursor: pointer;
        ">${label}</div>`,
      }),
    [iconSize, color, label],
  );

  return (
    <>
      <Rectangle
        bounds={bounds}
        pathOptions={{
          color,
          weight: isSelected ? 2.5 : 1,
          opacity: isSelected ? 1 : 0.7,
          fillColor: color,
          fillOpacity: isSelected ? 0.25 : 0.1,
          dashArray: isExisting ? undefined : '4 3',
        }}
        eventHandlers={{ click: onClick }}
      />
      <Marker
        position={[flag.y, flag.x]}
        icon={icon}
        draggable
        eventHandlers={{
          click: onClick,
          dragend: (e) => {
            const pos = e.target.getLatLng();
            onDragEnd(flag.id, Math.round(pos.lng), Math.round(pos.lat));
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
          <div style={{ fontSize: '10px', lineHeight: '1.2' }}>
            <strong style={{ color }}>{isExisting ? 'Existing' : 'Planned'} Flag</strong>
            <span style={{ color: '#9ca3af' }}> ({flag.x}, {flag.y})</span>
            {flag.rssPerHour > 0 && (
              <span style={{ color: '#fbbf24' }}> +{flag.rssPerHour.toLocaleString()}/h</span>
            )}
          </div>
        </Tooltip>
      </Marker>
    </>
  );
});

// ── Main Overlay ────────────────────────────────────────────────────

export default memo(function FlagPathOverlay({
  waypoints,
  flags,
  rssNodes,
  coveredNodeIds,
  currentPoint,
  isAddingWaypoint,
  isAddingFlag,
  zoom,
  selectedFlagId,
  onWaypointDragEnd,
  onFlagDragEnd,
  onFlagClick,
}: FlagPathOverlayProps) {
  // Path polyline through waypoints
  const pathPositions = useMemo<L.LatLngExpression[]>(
    () => waypoints.map((w) => [w.y, w.x] as [number, number]),
    [waypoints],
  );

  // Preview segment from last waypoint to cursor
  const previewPositions = useMemo<L.LatLngExpression[] | null>(() => {
    if (isAddingWaypoint && waypoints.length > 0 && currentPoint) {
      const last = waypoints[waypoints.length - 1];
      return [
        [last.y, last.x] as [number, number],
        [currentPoint.y, currentPoint.x] as [number, number],
      ];
    }
    return null;
  }, [isAddingWaypoint, waypoints, currentPoint]);

  // Flag preview at cursor
  const flagPreviewBounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (isAddingFlag && currentPoint) {
      return [
        [currentPoint.y - FLAG_HALF, currentPoint.x - FLAG_HALF],
        [currentPoint.y + FLAG_HALF, currentPoint.x + FLAG_HALF],
      ];
    }
    return null;
  }, [isAddingFlag, currentPoint]);

  // Covered RSS node highlights
  const coveredNodes = useMemo(
    () => (coveredNodeIds.size > 0 ? rssNodes.filter((n) => coveredNodeIds.has(n.id)) : []),
    [rssNodes, coveredNodeIds],
  );

  return (
    <>
      {/* Path polyline */}
      {pathPositions.length > 1 && (
        <Polyline
          positions={pathPositions}
          pathOptions={{ color: '#60a5fa', weight: 2, opacity: 0.6, dashArray: '6 4' }}
        />
      )}

      {/* Preview segment to cursor */}
      {previewPositions && (
        <Polyline
          positions={previewPositions}
          pathOptions={{ color: '#60a5fa', weight: 2, opacity: 0.4, dashArray: '4 4' }}
        />
      )}

      {/* Flag rectangles */}
      {flags.map((flag) => (
        <PlannedFlagRect
          key={flag.id}
          flag={flag}
          isSelected={flag.id === selectedFlagId}
          zoom={zoom}
          onClick={() => onFlagClick(flag.id)}
          onDragEnd={onFlagDragEnd}
        />
      ))}

      {/* Flag preview at cursor */}
      {flagPreviewBounds && (
        <Rectangle
          bounds={flagPreviewBounds}
          pathOptions={{
            color: '#06b6d4',
            weight: 1,
            opacity: 0.5,
            fillColor: '#06b6d4',
            fillOpacity: 0.1,
            dashArray: '4 3',
          }}
        />
      )}

      {/* Covered RSS node highlights */}
      {coveredNodes.map((node) => (
        <CircleMarker
          key={`cov-${node.id}`}
          center={[node.y, node.x]}
          radius={4}
          pathOptions={{
            color: '#fff',
            weight: 1.5,
            fillColor: RSS_TYPE_COLORS[node.type],
            fillOpacity: 0.9,
          }}
        />
      ))}

      {/* Waypoint markers (rendered on top) */}
      {waypoints.map((wp, i) => (
        <DraggableWaypoint
          key={wp.id}
          wp={wp}
          index={i}
          total={waypoints.length}
          onDragEnd={onWaypointDragEnd}
        />
      ))}
    </>
  );
});
