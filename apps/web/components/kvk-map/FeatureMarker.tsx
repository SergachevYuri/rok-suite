'use client';

import { useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapFeature } from '@/lib/kvk-map-types';
import { FEATURE_TYPE_CONFIG } from '@/lib/kvk-feature-config';

interface FeatureMarkerProps {
  feature: KvkMapFeature;
  isSelected?: boolean;
  isDraggable?: boolean;
  onClick?: (feature: KvkMapFeature) => void;
  onDragEnd?: (feature: KvkMapFeature, newX: number, newY: number) => void;
}

function createDivIcon(featureType: string, isSelected: boolean): L.DivIcon {
  const config = FEATURE_TYPE_CONFIG[featureType as keyof typeof FEATURE_TYPE_CONFIG];
  if (!config) return new L.DivIcon();

  const size = isSelected ? 32 : 24;
  const borderWidth = isSelected ? 3 : 2;
  const borderColor = isSelected ? '#ffffff' : 'rgba(0,0,0,0.5)';

  return new L.DivIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background-color: ${config.color};
      border: ${borderWidth}px solid ${borderColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${isSelected ? '11px' : '9px'};
      font-weight: 700;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4)${isSelected ? ', 0 0 12px rgba(255,255,255,0.4)' : ''};
    ">${config.abbreviation}</div>`,
  });
}

export default function FeatureMarker({
  feature,
  isSelected = false,
  isDraggable = false,
  onClick,
  onDragEnd,
}: FeatureMarkerProps) {
  const icon = useMemo(
    () => createDivIcon(feature.feature_type, isSelected),
    [feature.feature_type, isSelected]
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
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          // lng = x, lat = y in CRS.Simple
          onDragEnd?.(feature, pos.lng, pos.lat);
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
        <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
          <strong>{feature.name || config?.label || feature.feature_type}</strong>
          {config?.buffs.map((buff, i) => (
            <div key={i} style={{ color: '#9ca3af' }}>{buff}</div>
          ))}
          {(config?.kingdomHonor || config?.allianceHonor) && (
            <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '2px' }}>
              {config.kingdomHonor && <>Kingdom {config.kingdomHonor}</>}
              {config.kingdomHonor && config.allianceHonor && ' · '}
              {config.allianceHonor && <>Alliance {config.allianceHonor}</>}
            </div>
          )}
          {feature.level != null && (
            <div style={{ color: '#6b7280', fontSize: '10px' }}>
              Level {feature.level}
            </div>
          )}
          {feature.zone != null && (
            <div style={{ color: '#6b7280', fontSize: '10px' }}>
              Zone {feature.zone}
            </div>
          )}
        </div>
      </Tooltip>
    </Marker>
  );
}
