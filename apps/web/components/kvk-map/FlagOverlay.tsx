'use client';

import { useMemo } from 'react';
import { Rectangle, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapFeature, AssignmentStatus } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';

interface FlagOverlayProps {
  feature: KvkMapFeature;
  isSelected?: boolean;
  isDraggable?: boolean;
  zoom?: number;
  allianceColor?: string | null;
  allianceTag?: string | null;
  assignmentStatus?: AssignmentStatus | null;
  onClick?: (feature: KvkMapFeature) => void;
  onDragEnd?: (feature: KvkMapFeature, newX: number, newY: number) => void;
  onMouseOver?: (feature: KvkMapFeature) => void;
  onMouseOut?: (feature: KvkMapFeature) => void;
}

export default function FlagOverlay({
  feature,
  isSelected = false,
  isDraggable = false,
  zoom = -1,
  allianceColor,
  allianceTag,
  assignmentStatus,
  onClick,
  onDragEnd,
  onMouseOver,
  onMouseOut,
}: FlagOverlayProps) {
  const config = FEATURE_TYPE_CONFIG[feature.feature_type];
  const tileSize = config?.tileSize ?? 9;
  const half = tileSize / 2;

  const color = allianceColor || config?.color || '#64748b';
  const statusOpacity = assignmentStatus === 'lost' ? 0.3 : 1;

  // Rectangle bounds: [southWest, northEast] = [[y-half, x-half], [y+half, x+half]]
  const rectBounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [feature.y - half, feature.x - half],
      [feature.y + half, feature.x + half],
    ],
    [feature.x, feature.y, half]
  );

  // Center marker position: [y, x] in CRS.Simple
  const position = useMemo<L.LatLngExpression>(
    () => [feature.y, feature.x],
    [feature.x, feature.y]
  );

  // Small center icon for click/drag
  const icon = useMemo(() => {
    const size = 14 + (zoom + 2) * 2;
    const label = allianceTag || config?.abbreviation || 'FL';
    return new L.DivIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 2px;
        background: rgba(0,0,0,0.6);
        border: 1px solid ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${Math.max(8, Math.round(size * 0.55))}px;
        font-weight: 700;
        color: ${color};
        cursor: pointer;
      ">${label}</div>`,
    });
  }, [zoom, color, allianceTag, config?.abbreviation]);

  return (
    <>
      <Rectangle
        bounds={rectBounds}
        pathOptions={{
          color,
          weight: isSelected ? 2 : 1,
          opacity: statusOpacity,
          fillColor: color,
          fillOpacity: (isSelected ? 0.35 : 0.2) * statusOpacity,
          dashArray: isSelected ? undefined : '4 2',
        }}
        eventHandlers={{
          click: () => onClick?.(feature),
        }}
      />
      <Marker
        position={position}
        icon={icon}
        draggable={isDraggable}
        eventHandlers={{
          click: () => onClick?.(feature),
          mouseover: () => onMouseOver?.(feature),
          mouseout: () => onMouseOut?.(feature),
          dragend: (e) => {
            const pos = e.target.getLatLng();
            onDragEnd?.(feature, pos.lng, pos.lat);
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -10]} opacity={0.92}>
          <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
            <strong>{config?.label}</strong>
            <span style={{ color: '#9ca3af' }}> {tileSize}×{tileSize}</span>
            {allianceTag && (
              <span style={{ color: allianceColor || '#9ca3af', fontWeight: 600 }}> [{allianceTag}]</span>
            )}
          </div>
        </Tooltip>
      </Marker>
    </>
  );
}
