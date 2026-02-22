'use client';

import { useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapFeature, AssignmentStatus } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';

interface FeatureMarkerProps {
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

/**
 * Convert a hex color (#rrggbb) to an rgba string.
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function createDivIcon(
  featureType: string,
  isSelected: boolean,
  level: number | null,
  zoom: number,
  allianceColor?: string | null,
  assignmentStatus?: AssignmentStatus | null,
): L.DivIcon {
  const config = FEATURE_TYPE_CONFIG[featureType as keyof typeof FEATURE_TYPE_CONFIG];
  if (!config) return new L.DivIcon();

  // Scale: 16px at zoom -2, 20px at -1, 24 at 0, 28 at 1, 32 at 2
  const baseSize = 16 + (zoom + 2) * 4;
  const innerSize = isSelected ? baseSize + 8 : baseSize;
  const displayText = level != null ? String(level) : config.abbreviation;
  const bg = isSelected ? config.color : hexToRgba(config.color, 0.55);
  const border = isSelected
    ? `2px solid rgba(255,255,255,0.8)`
    : `1.5px solid rgba(0,0,0,0.25)`;
  const shadow = isSelected
    ? '0 0 10px rgba(255,255,255,0.35)'
    : '0 1px 3px rgba(0,0,0,0.3)';

  // Alliance color ring
  const hasRing = !!allianceColor;
  const ringPad = hasRing ? 3 : 0;
  const totalSize = innerSize + ringPad * 2;
  const ringBorder = hasRing ? `3px solid ${allianceColor}` : 'none';
  const statusOpacity = assignmentStatus === 'lost' ? 0.4 : 1;

  const innerHtml = `<div class="kvk-badge" style="
    --c: ${config.color};
    width: ${innerSize}px;
    height: ${innerSize}px;
    border-radius: 50%;
    background-color: ${bg};
    border: ${border};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${Math.round(innerSize * 0.45)}px;
    font-weight: 700;
    color: rgba(255,255,255,${isSelected ? '1' : '0.9'});
    text-shadow: 0 1px 2px rgba(0,0,0,0.6);
    cursor: pointer;
    box-shadow: ${shadow};
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
  ">${displayText}</div>`;

  const html = hasRing
    ? `<div style="
        border: ${ringBorder};
        border-radius: 50%;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: ${statusOpacity};
        ${assignmentStatus === 'contested' ? 'animation: pulse 1.5s ease-in-out infinite;' : ''}
      ">${innerHtml}</div>`
    : `<div style="opacity: ${statusOpacity};">${innerHtml}</div>`;

  return new L.DivIcon({
    className: '',
    iconSize: [totalSize, totalSize],
    iconAnchor: [totalSize / 2, totalSize / 2],
    html,
  });
}

export default function FeatureMarker({
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
}: FeatureMarkerProps) {
  const icon = useMemo(
    () => createDivIcon(feature.feature_type, isSelected, feature.level, zoom, allianceColor, assignmentStatus),
    [feature.feature_type, isSelected, feature.level, zoom, allianceColor, assignmentStatus]
  );

  const config = FEATURE_TYPE_CONFIG[feature.feature_type];

  // CRS.Simple: position is [lat, lng] = [y, x]
  const position: L.LatLngExpression = [feature.y, feature.x];

  return (
    <Marker
      position={position}
      icon={icon}
      draggable={isDraggable}
      eventHandlers={{
        click: () => onClick?.(feature),
        mouseover: () => onMouseOver?.(feature),
        mouseout: () => onMouseOut?.(feature),
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          // lng = x, lat = y in CRS.Simple
          onDragEnd?.(feature, pos.lng, pos.lat);
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -14]} opacity={0.92}>
        <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
          <strong>{feature.name || config?.label || feature.feature_type}</strong>
          {feature.level != null && (
            <span style={{ color: '#9ca3af', fontWeight: 400 }}> Lv{feature.level}</span>
          )}
          {allianceTag && (
            <span style={{ color: allianceColor || '#9ca3af', fontWeight: 600 }}> [{allianceTag}]</span>
          )}
          {config?.buffs.length > 0 && (
            <div style={{ color: '#9ca3af', fontSize: '10px' }}>
              {config.buffs.join(', ')}
            </div>
          )}
        </div>
      </Tooltip>
    </Marker>
  );
}
