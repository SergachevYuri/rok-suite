'use client';

import type { ReactNode } from 'react';

interface StatusBarProps {
  color: string;
  children: ReactNode;
}

export default function StatusBar({ color, children }: StatusBarProps) {
  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: 'rgba(0,0,0,0.8)',
        color,
        border: '1px solid var(--border)',
      }}
    >
      {children}
    </div>
  );
}
