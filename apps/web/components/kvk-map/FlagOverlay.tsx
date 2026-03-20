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
  dimmed?: boolean;
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
  dimmed = false,
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
  const dimScale = dimmed ? 0.2 : 1;
  const statusOpacity = (assignmentStatus === 'lost' ? 0.25 : 0.7) * dimScale;

  // Zoomed in: full rectangle + label; zoomed out: small colored dot
  const detailed = zoom >= 1;

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

  const isFortress = feature.feature_type === 'fortress';

  // Center icon: small colored dot when zoomed out, labeled box when zoomed in
  const icon = useMemo(() => {
    if (!detailed) {
      const dotSize = Math.max(4, 3 + (zoom + 2) * 2);
      if (isFortress) {
        // Fortress: larger square with white border, stands out
        const fortSize = Math.round(dotSize * 2.2);
        return new L.DivIcon({
          className: '',
          iconSize: [fortSize, fortSize],
          iconAnchor: [fortSize / 2, fortSize / 2],
          html: `<div style="
              width: ${fortSize}px;
              height: ${fortSize}px;
              border-radius: 2px;
              background: ${color};
              opacity: ${statusOpacity};
              border: 2px solid rgba(255,255,255,0.8);
              box-shadow: 0 0 4px rgba(0,0,0,0.6);
              cursor: pointer;
            "></div>`,
        });
      }
      return new L.DivIcon({
        className: '',
        iconSize: [dotSize, dotSize],
        iconAnchor: [dotSize / 2, dotSize / 2],
        html: `<div style="
            width: ${dotSize}px;
            height: ${dotSize}px;
            border-radius: 50%;
            background: ${color};
            opacity: ${statusOpacity * 0.9};
            border: 0.5px solid rgba(0,0,0,0.3);
            cursor: pointer;
          "></div>`,
      });
    }
    const baseSize = 12 + (zoom + 2) * 1.5;
    const label = allianceTag || config?.abbreviation || 'FL';
    if (isFortress) {
      // Fortress: prominent castle-tower icon
      const size = Math.round(baseSize * 2);
      const iconSvg = `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.55)}" height="${Math.round(size * 0.55)}" fill="${color}">
        <path d="M1 22V9h2V7h2V5h2V3h2v2h2V3h2v2h2V5h2v2h2v2h2v13h-8v-4h-4v4H1zm2-2h4v-4h6v4h4V11h-2V9h-2V7H11v2H9v2H7v2H5v7h-2z"/>
      </svg>`;
      return new L.DivIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div style="
            width: ${size}px;
            height: ${size}px;
            border-radius: 4px;
            background: rgba(0,0,0,0.7);
            border: 2px solid ${color};
            box-shadow: 0 0 6px ${color}88;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1px;
            cursor: pointer;
            opacity: ${dimScale};
          ">${iconSvg}<span style="font-size:${Math.max(7, Math.round(size * 0.28))}px;font-weight:700;color:${color};line-height:1;">${label}</span></div>`,
      });
    }
    const size = baseSize;
    return new L.DivIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 2px;
          background: rgba(0,0,0,0.45);
          border: 0.5px solid ${color};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${Math.max(7, Math.round(size * 0.5))}px;
          font-weight: 600;
          color: ${color};
          cursor: pointer;
          opacity: ${dimScale * 0.85};
        ">${label}</div>`,
    });
  }, [zoom, detailed, color, statusOpacity, allianceTag, config?.abbreviation, dimScale, isFortress]);

  return (
    <>
      {/* Only show rectangle outlines when zoomed in */}
      {detailed && (
        <Rectangle
          bounds={rectBounds}
          pathOptions={{
            color,
            weight: isFortress ? (isSelected ? 3 : 2) : (isSelected ? 2 : 1),
            opacity: isFortress ? Math.min(statusOpacity * 1.4, 1) : statusOpacity,
            fillColor: color,
            fillOpacity: isFortress
              ? (isSelected ? 0.35 : 0.2) * statusOpacity
              : (isSelected ? 0.25 : 0.15) * statusOpacity,
            dashArray: isSelected ? undefined : (isFortress ? undefined : '4 3'),
          }}
          eventHandlers={{
            click: () => onClick?.(feature),
          }}
        />
      )}
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
