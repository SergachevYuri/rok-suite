'use client';

interface CoordinateDisplayProps {
  x: number | null;
  y: number | null;
}

export default function CoordinateDisplay({ x, y }: CoordinateDisplayProps) {
  if (x === null || y === null) return null;

  return (
    <div
      className="absolute bottom-2 left-2 z-[1000] px-2 py-1 rounded text-xs font-mono"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
      }}
    >
      x: {Math.round(x)}, y: {Math.round(y)}
    </div>
  );
}
