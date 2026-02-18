'use client';

import { useState, useRef, useEffect } from 'react';
import { History } from 'lucide-react';

interface NameHistoryBadgeProps {
  previousNames: string[];
  size?: 'sm' | 'md';
}

export function NameHistoryBadge({ previousNames, size = 'sm' }: NameHistoryBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (previousNames.length === 0) return null;

  const iconSize = size === 'sm' ? 10 : 12;

  return (
    <div ref={ref} className="relative inline-flex items-center flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="p-0.5 rounded hover:bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
        title={`${previousNames.length} previous name${previousNames.length > 1 ? 's' : ''}`}
      >
        <History size={iconSize} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] max-w-[240px] bg-[var(--background-card)] border border-[var(--border)] rounded-lg shadow-xl p-2">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1 px-1">
            Previous names
          </div>
          {previousNames.map((name, i) => (
            <div key={i} className="px-1 py-0.5 text-xs text-[var(--text-secondary)] truncate">
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
