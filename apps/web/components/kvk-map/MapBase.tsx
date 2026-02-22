'use client';

// Leaflet CRS.Simple coordinate system:
// - bounds [[0,0], [height, width]] where [0,0] is bottom-left
// - lat = y (vertical), lng = x (horizontal)
// - click events: e.latlng.lng = x, e.latlng.lat = y

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { MapContainer, ImageOverlay, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapBaseProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  children?: ReactNode;
  onClick?: (x: number, y: number) => void;
  onDoubleClick?: (x: number, y: number) => void;
  onMouseMove?: (x: number, y: number) => void;
  onZoomChange?: (zoom: number) => void;
  className?: string;
  cursorStyle?: string;
}

function CursorStyle({ cursor }: { cursor?: string }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (cursor) {
      container.style.cursor = cursor;
      container.classList.remove('leaflet-grab');
    } else {
      container.style.cursor = '';
      container.classList.add('leaflet-grab');
    }
  }, [map, cursor]);
  return null;
}

function MapEventHandler({
  onClick,
  onDoubleClick,
  onMouseMove,
  onZoomChange,
}: {
  onClick?: (x: number, y: number) => void;
  onDoubleClick?: (x: number, y: number) => void;
  onMouseMove?: (x: number, y: number) => void;
  onZoomChange?: (zoom: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lng, e.latlng.lat);
    },
    dblclick(e) {
      onDoubleClick?.(e.latlng.lng, e.latlng.lat);
    },
    mousemove(e) {
      onMouseMove?.(e.latlng.lng, e.latlng.lat);
    },
    zoomend(e) {
      onZoomChange?.(e.target.getZoom());
    },
  });
  return null;
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) {
      map.fitBounds(bounds);
      fitted.current = true;
    }
  }, [map, bounds]);
  return null;
}

export default function MapBase({
  imageUrl,
  imageWidth,
  imageHeight,
  children,
  onClick,
  onDoubleClick,
  onMouseMove,
  onZoomChange,
  className = '',
  cursorStyle,
}: MapBaseProps) {
  const bounds = useMemo<L.LatLngBoundsExpression>(
    () => [[0, 0], [imageHeight, imageWidth]],
    [imageHeight, imageWidth]
  );
  const center = useMemo<L.LatLngExpression>(
    () => [imageHeight / 2, imageWidth / 2],
    [imageHeight, imageWidth]
  );

  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={center}
      zoom={-1}
      minZoom={-2}
      maxZoom={2}
      maxBounds={bounds}
      maxBoundsViscosity={1.0}
      style={{ width: '100%', height: '100%', background: '#0a0e1a' }}
      className={className}
      attributionControl={false}
      zoomControl={true}
    >
      <ImageOverlay url={imageUrl} bounds={bounds} />
      <FitBounds bounds={bounds} />
      <CursorStyle cursor={cursorStyle} />
      <MapEventHandler onClick={onClick} onDoubleClick={onDoubleClick} onMouseMove={onMouseMove} onZoomChange={onZoomChange} />
      {children}
    </MapContainer>
  );
}
