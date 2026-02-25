'use client';

import { memo, useMemo, useEffect } from 'react';
import { CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { RssNode, RssNodeType } from '@/lib/kvk-map/rss-review';
import { RSS_TYPE_COLORS, RSS_TYPE_LABELS } from '@/lib/kvk-map/rss-review';

interface RssNodeOverlayProps {
  nodes: RssNode[];
  selectedId: number | null;
  interactive?: boolean;
  onSelect: (id: number | null) => void;
  onMove: (id: number, x: number, y: number) => void;
  zoom: number;
  flyToTarget: { x: number; y: number } | null;
}

/** Invisible component that flies the map to a target position */
function FlyToNode({ x, y }: { x: number; y: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([y, x], Math.max(map.getZoom(), 1), { duration: 0.4 });
  }, [map, x, y]);
  return null;
}

const RssNodeDot = memo(function RssNodeDot({
  node,
  isSelected,
  onClick,
  zoom,
}: {
  node: RssNode;
  isSelected: boolean;
  onClick: () => void;
  zoom: number;
}) {
  const color = RSS_TYPE_COLORS[node.type];
  const isDetected = node.source === 'detected';
  const baseOpacity = node.status === 'rejected' ? 0.2 : node.status === 'approved' ? 1 : 0.7;
  const opacity = isDetected ? baseOpacity * 0.8 : baseOpacity;

  // Detected nodes: zoom-responsive DivIcon with glow
  if (isDetected && !isSelected) {
    const baseSize = Math.max(6, 6 + (zoom + 2) * 3);
    const glowSize = Math.max(2, (zoom + 2) * 2);

    const icon = new L.DivIcon({
      className: '',
      iconSize: [baseSize, baseSize],
      iconAnchor: [baseSize / 2, baseSize / 2],
      html: `<div style="
        width: ${baseSize}px; height: ${baseSize}px;
        border-radius: 50%;
        background: ${color};
        opacity: ${opacity};
        border: 1.5px dashed rgba(255,255,255,0.6);
        box-shadow: 0 0 ${glowSize}px ${color}, 0 0 ${glowSize * 2}px ${color}40;
        cursor: pointer;
      "></div>`,
    });

    return (
      <Marker
        position={[node.y, node.x]}
        icon={icon}
        eventHandlers={{ click: onClick }}
      />
    );
  }

  // Manual nodes + selected: CircleMarker as before
  const radius = isSelected ? 6 : 3;

  return (
    <CircleMarker
      center={[node.y, node.x]}
      radius={radius}
      pathOptions={{
        color: isSelected ? '#fff' : isDetected ? '#fff' : color,
        weight: isSelected ? 2 : isDetected ? 1 : 0,
        fillColor: color,
        fillOpacity: opacity,
        dashArray: isDetected && !isSelected ? '2, 2' : undefined,
      }}
      eventHandlers={{ click: onClick }}
    >
      {isSelected && (
        <Tooltip direction="top" offset={[0, -8]} opacity={0.95} permanent>
          <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
            <strong>{RSS_TYPE_LABELS[node.type]}</strong>
            <span style={{ color: '#9ca3af' }}> ({node.x}, {node.y})</span>
            <br />
            <span style={{ color: node.status === 'approved' ? '#22c55e' : node.status === 'rejected' ? '#ef4444' : '#9ca3af' }}>
              {node.status}
            </span>
            {isDetected && (
              <>
                <br />
                <span style={{ color: '#a855f7' }}>AI detected</span>
              </>
            )}
          </div>
        </Tooltip>
      )}
    </CircleMarker>
  );
});

function SelectedNodeMarker({
  node,
  onMove,
}: {
  node: RssNode;
  onMove: (x: number, y: number) => void;
}) {
  const color = RSS_TYPE_COLORS[node.type];

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
          box-shadow: 0 0 6px rgba(0,0,0,0.5);
          cursor: grab;
        "></div>`,
      }),
    [color]
  );

  return (
    <Marker
      position={[node.y, node.x]}
      icon={icon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const pos = e.target.getLatLng();
          onMove(Math.round(pos.lng), Math.round(pos.lat));
        },
      }}
    />
  );
}

export default memo(function RssNodeOverlay({
  nodes,
  selectedId,
  interactive = true,
  onSelect,
  onMove,
  zoom,
  flyToTarget,
}: RssNodeOverlayProps) {
  const selectedNode = selectedId != null ? nodes.find((n) => n.id === selectedId) : null;

  return (
    <>
      {flyToTarget && <FlyToNode x={flyToTarget.x} y={flyToTarget.y} />}
      {nodes.map((node) => (
        <RssNodeDot
          key={node.id}
          node={node}
          isSelected={node.id === selectedId}
          onClick={() => interactive && onSelect(node.id === selectedId ? null : node.id)}
          zoom={zoom}
        />
      ))}
      {selectedNode && (
        <SelectedNodeMarker
          node={selectedNode}
          onMove={(x, y) => onMove(selectedNode.id, x, y)}
        />
      )}
    </>
  );
});
