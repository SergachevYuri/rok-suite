'use client';

import { useMemo, memo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Polyline, CircleMarker, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { KvkMapArrow, KvkMapDrawing, KvkMapLabel } from '@/lib/kvk-map-types';
import { ARROW_TYPE_COLORS } from '@/lib/kvk-map/annotation-constants';

// ─── Arrow Head (SVG triangle at end of polyline) ───────────────────

function ArrowHead({ from, to, color, size = 10 }: { from: [number, number]; to: [number, number]; color: string; size?: number }) {
  const angle = Math.atan2(to[0] - from[0], to[1] - from[1]);

  const tip: [number, number] = to;
  const left: [number, number] = [
    to[0] - size * Math.cos(angle - Math.PI / 6),
    to[1] - size * Math.sin(angle - Math.PI / 6),
  ];
  const right: [number, number] = [
    to[0] - size * Math.cos(angle + Math.PI / 6),
    to[1] - size * Math.sin(angle + Math.PI / 6),
  ];

  return (
    <Polyline
      positions={[left, tip, right]}
      pathOptions={{ color, weight: 2, opacity: 0.9, fill: true, fillColor: color, fillOpacity: 0.7 }}
    />
  );
}

// ─── Single Arrow ───────────────────────────────────────────────────

const ArrowOverlayItem = memo(function ArrowOverlayItem({
  arrow,
  isSelected,
  onClick,
}: {
  arrow: KvkMapArrow;
  isSelected: boolean;
  onClick: () => void;
}) {
  const color = arrow.color_override || ARROW_TYPE_COLORS[arrow.arrow_type] || '#9ca3af';
  const positions = useMemo<L.LatLngExpression[]>(
    () => arrow.waypoints.map(([x, y]) => [y, x] as [number, number]),
    [arrow.waypoints],
  );

  const dashArray = arrow.dash_style === 'dashed' ? '8 5' : undefined;
  const weight = isSelected ? arrow.weight + 1.5 : arrow.weight;

  // Arrow head at end
  const lastTwo = arrow.waypoints.length >= 2
    ? {
        from: [arrow.waypoints[arrow.waypoints.length - 2][1], arrow.waypoints[arrow.waypoints.length - 2][0]] as [number, number],
        to: [arrow.waypoints[arrow.waypoints.length - 1][1], arrow.waypoints[arrow.waypoints.length - 1][0]] as [number, number],
      }
    : null;

  if (positions.length < 2) return null;

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{ color, weight, opacity: isSelected ? 1 : 0.8, dashArray }}
        eventHandlers={{ click: onClick }}
      />
      {lastTwo && <ArrowHead from={lastTwo.from} to={lastTwo.to} color={color} />}
      {arrow.label && positions.length > 0 && (
        <Marker
          position={positions[Math.floor(positions.length / 2)]}
          icon={new L.DivIcon({
            className: '',
            iconSize: [0, 0],
            html: `<div style="
              position: absolute; transform: translate(-50%, -150%);
              white-space: nowrap; font-size: 11px; font-weight: 600;
              color: ${color}; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
              pointer-events: none;
            ">${arrow.label}</div>`,
          })}
          interactive={false}
        />
      )}
    </>
  );
});

// ─── Single Drawing ─────────────────────────────────────────────────

const DrawingOverlayItem = memo(function DrawingOverlayItem({
  drawing,
  isSelected,
  onClick,
}: {
  drawing: KvkMapDrawing;
  isSelected: boolean;
  onClick: () => void;
}) {
  const positions = useMemo<L.LatLngExpression[]>(
    () => drawing.points.map(([x, y]) => [y, x] as [number, number]),
    [drawing.points],
  );

  if (positions.length < 2) return null;

  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: drawing.color,
        weight: isSelected ? drawing.weight + 1.5 : drawing.weight,
        opacity: drawing.opacity,
        lineCap: 'round',
        lineJoin: 'round',
      }}
      eventHandlers={{ click: onClick }}
    />
  );
});

// ─── Single Label ───────────────────────────────────────────────────

const LabelOverlayItem = memo(function LabelOverlayItem({
  label,
  isSelected,
  isDraggable,
  onClick,
  onDragEnd,
}: {
  label: KvkMapLabel;
  isSelected: boolean;
  isDraggable: boolean;
  onClick: () => void;
  onDragEnd: (id: string, x: number, y: number) => void;
}) {
  const icon = useMemo(
    () =>
      new L.DivIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="
          position: absolute; transform: translate(-50%, -50%);
          white-space: nowrap;
          font-size: ${label.font_size}px; font-weight: 600;
          color: ${label.color};
          text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5);
          cursor: ${isDraggable ? 'grab' : 'pointer'};
          ${isSelected ? `outline: 2px solid ${label.color}; outline-offset: 3px; border-radius: 2px;` : ''}
        ">${label.text}</div>`,
      }),
    [label.text, label.color, label.font_size, isSelected, isDraggable],
  );

  return (
    <Marker
      position={[label.y, label.x]}
      icon={icon}
      draggable={isDraggable}
      eventHandlers={{
        click: onClick,
        dragend: (e) => {
          const pos = e.target.getLatLng();
          onDragEnd(label.id, Math.round(pos.lng), Math.round(pos.lat));
        },
      }}
    />
  );
});

// ─── Live Drawing Preview ───────────────────────────────────────────

const LiveDrawingPreview = memo(function LiveDrawingPreview({
  points,
  color,
  weight,
}: {
  points: [number, number][];
  color: string;
  weight: number;
}) {
  const positions = useMemo<L.LatLngExpression[]>(
    () => points.map(([x, y]) => [y, x] as [number, number]),
    [points],
  );

  if (positions.length < 2) return null;

  return (
    <Polyline
      positions={positions}
      pathOptions={{ color, weight, opacity: 0.7, lineCap: 'round', lineJoin: 'round' }}
    />
  );
});

// ─── Arrow Drawing Preview ──────────────────────────────────────────

const ArrowPreview = memo(function ArrowPreview({
  points,
  color,
  cursorPoint,
}: {
  points: [number, number][];
  color: string;
  cursorPoint?: { x: number; y: number } | null;
}) {
  const allPoints = useMemo(() => {
    const pts = [...points];
    if (cursorPoint) pts.push([cursorPoint.x, cursorPoint.y]);
    return pts;
  }, [points, cursorPoint]);

  const positions = useMemo<L.LatLngExpression[]>(
    () => allPoints.map(([x, y]) => [y, x] as [number, number]),
    [allPoints],
  );

  if (positions.length < 1) return null;

  // Single point: show a dot
  if (positions.length === 1) {
    return <CircleMarker center={positions[0]} radius={4} pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 1 }} />;
  }

  const lastTwo = allPoints.length >= 2
    ? {
        from: [allPoints[allPoints.length - 2][1], allPoints[allPoints.length - 2][0]] as [number, number],
        to: [allPoints[allPoints.length - 1][1], allPoints[allPoints.length - 1][0]] as [number, number],
      }
    : null;

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: '6 4' }}
      />
      {lastTwo && <ArrowHead from={lastTwo.from} to={lastTwo.to} color={color} size={8} />}
    </>
  );
});

// ─── Inline Text Input (placed on map for new labels) ───────────────

interface PendingLabel {
  x: number;
  y: number;
  color: string;
}

const InlineTextInput = memo(function InlineTextInput({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingLabel;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus after a tick to avoid Leaflet swallowing the focus
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const icon = useMemo(
    () =>
      new L.DivIcon({
        className: '',
        iconSize: [0, 0],
        html: '<div id="inline-text-anchor" style="position:absolute;transform:translate(-50%,-50%);"></div>',
      }),
    [],
  );

  const handleSubmit = () => {
    if (text.trim()) onConfirm(text.trim());
    else onCancel();
  };

  return (
    <>
      <Marker position={[pending.y, pending.x]} icon={icon} interactive={false} />
      {/* Render the input as a Leaflet-independent overlay to avoid DivIcon re-render issues */}
      <InlineInputPortal x={pending.x} y={pending.y} color={pending.color}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onCancel();
          }}
          onBlur={handleSubmit}
          placeholder="Type label..."
          className="bg-transparent border-b outline-none text-sm font-semibold"
          style={{
            color: pending.color,
            borderColor: pending.color,
            caretColor: pending.color,
            minWidth: '80px',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          }}
        />
      </InlineInputPortal>
    </>
  );
});

// Portal that positions an HTML element at map coordinates
function InlineInputPortal({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  color: string;
  children: React.ReactNode;
}) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const point = map.latLngToContainerPoint([y, x]);
      containerRef.current.style.left = `${point.x}px`;
      containerRef.current.style.top = `${point.y}px`;
    };
    update();
    map.on('move zoom', update);
    return () => { map.off('move zoom', update); };
  }, [map, x, y]);

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>,
    map.getContainer(),
  );
}

// ─── Main Overlay ───────────────────────────────────────────────────

interface AnnotationOverlayProps {
  arrows: KvkMapArrow[];
  drawings: KvkMapDrawing[];
  labels: KvkMapLabel[];
  selectedId: string | null;
  isDraggable: boolean;
  stage: number;
  onClickItem: (type: 'arrow' | 'drawing' | 'label', id: string) => void;
  onLabelDragEnd: (id: string, x: number, y: number) => void;
  // Live drawing/arrow preview
  liveDrawingPoints?: [number, number][];
  liveDrawingColor?: string;
  liveDrawingWeight?: number;
  liveArrowPoints?: [number, number][];
  liveArrowColor?: string;
  cursorPoint?: { x: number; y: number } | null;
  // Inline text input for new labels
  pendingLabel?: PendingLabel | null;
  onPendingLabelConfirm?: (text: string) => void;
  onPendingLabelCancel?: () => void;
}

export default memo(function AnnotationOverlay({
  arrows,
  drawings,
  labels,
  selectedId,
  isDraggable,
  stage,
  onClickItem,
  onLabelDragEnd,
  liveDrawingPoints,
  liveDrawingColor = '#ef4444',
  liveDrawingWeight = 3,
  liveArrowPoints,
  liveArrowColor = '#ef4444',
  cursorPoint,
  pendingLabel,
  onPendingLabelConfirm,
  onPendingLabelCancel,
}: AnnotationOverlayProps) {
  // Filter by stage
  const stageArrows = useMemo(() => arrows.filter((a) => a.stage === stage), [arrows, stage]);
  const stageDrawings = useMemo(() => drawings.filter((d) => d.stage === stage), [drawings, stage]);
  const stageLabels = useMemo(() => labels.filter((l) => l.stage === stage), [labels, stage]);

  return (
    <>
      {/* Drawings (render first, below arrows) */}
      {stageDrawings.map((d) => (
        <DrawingOverlayItem
          key={d.id}
          drawing={d}
          isSelected={d.id === selectedId}
          onClick={() => onClickItem('drawing', d.id)}
        />
      ))}

      {/* Arrows */}
      {stageArrows.map((a) => (
        <ArrowOverlayItem
          key={a.id}
          arrow={a}
          isSelected={a.id === selectedId}
          onClick={() => onClickItem('arrow', a.id)}
        />
      ))}

      {/* Text labels */}
      {stageLabels.map((l) => (
        <LabelOverlayItem
          key={l.id}
          label={l}
          isSelected={l.id === selectedId}
          isDraggable={isDraggable}
          onClick={() => onClickItem('label', l.id)}
          onDragEnd={onLabelDragEnd}
        />
      ))}

      {/* Inline text input for new label */}
      {pendingLabel && onPendingLabelConfirm && onPendingLabelCancel && (
        <InlineTextInput
          pending={pendingLabel}
          onConfirm={onPendingLabelConfirm}
          onCancel={onPendingLabelCancel}
        />
      )}

      {/* Live drawing preview */}
      {liveDrawingPoints && liveDrawingPoints.length > 0 && (
        <LiveDrawingPreview points={liveDrawingPoints} color={liveDrawingColor} weight={liveDrawingWeight} />
      )}

      {/* Live arrow preview */}
      {liveArrowPoints && liveArrowPoints.length > 0 && (
        <ArrowPreview points={liveArrowPoints} color={liveArrowColor} cursorPoint={cursorPoint} />
      )}
    </>
  );
});
