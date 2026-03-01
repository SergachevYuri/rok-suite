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

/** Invisible component that flies the map to a target position, offset to avoid sidebar */
function FlyToNode({ x, y }: { x: number; y: number }) {
  const map = useMap();
  useEffect(() => {
    const zoom = Math.max(map.getZoom(), 1);
    // Right sidebar is lg:w-72 = 288px. Offset the target so node appears
    // in the center of the *visible* area (container minus sidebar).
    const sidebarPx = 288;
    const containerW = map.getSize().x;
    // Visible width = container - sidebar; offset = shift target rightward
    // by half-sidebar so node centers in the visible portion
    const offsetPx = Math.min(sidebarPx / 2, containerW * 0.3);
    const targetPoint = map.project([y, x], zoom);
    targetPoint.x += offsetPx;
    const offsetLatLng = map.unproject(targetPoint, zoom);
    map.flyTo(offsetLatLng, zoom, { duration: 0.4 });
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

  // Manual nodes: solid circle with white border for visibility
  const radius = isSelected ? 6 : 5;

  return (
    <CircleMarker
      center={[node.y, node.x]}
      radius={radius}
      pathOptions={{
        color: '#fff',
        weight: isSelected ? 2 : 1.5,
        fillColor: color,
        fillOpacity: opacity,
      }}
      eventHandlers={{ click: onClick }}
    />
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

  // Transparent ring + crosshair so the actual map icon is visible underneath
  const icon = useMemo(
    () =>
      new L.DivIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="
          width: 28px; height: 28px;
          border-radius: 50%;
          background: transparent;
          border: 2px solid ${color};
          box-shadow: 0 0 6px ${color}, 0 0 2px rgba(0,0,0,0.8);
          cursor: grab;
          position: relative;
        ">
          <div style="
            position: absolute; top: 50%; left: -4px; right: -4px; height: 1px;
            background: ${color}; opacity: 0.6;
          "></div>
          <div style="
            position: absolute; left: 50%; top: -4px; bottom: -4px; width: 1px;
            background: ${color}; opacity: 0.6;
          "></div>
        </div>`,
      }),
    [color]
  );

  return (
    <>
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
      <CircleMarker
        center={[node.y, node.x]}
        radius={0}
        pathOptions={{ opacity: 0, fillOpacity: 0 }}
      >
        <Tooltip direction="right" offset={[18, 0]} opacity={0.9} permanent>
          <div style={{ fontSize: '10px', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
            <strong style={{ color }}>{RSS_TYPE_LABELS[node.type]}</strong>
            <span style={{ color: '#9ca3af' }}> ({node.x}, {node.y})</span>
          </div>
        </Tooltip>
      </CircleMarker>
    </>
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
