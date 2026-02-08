'use client';

import { stripRokMarkup } from '@/lib/rok-mail/parser';

interface CharCounterProps {
  content: string;
  maxChars?: number;
  partCount?: number;
}

export function CharCounter({ content, maxChars = 2000, partCount }: CharCounterProps) {
  const rawLen = content.length;
  const plainLen = stripRokMarkup(content).length;

  const colorClass =
    rawLen > 1900
      ? 'text-red-400'
      : rawLen > 1500
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`font-mono ${colorClass}`}>
        {rawLen}/{maxChars}
      </span>
      {rawLen !== plainLen && (
        <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
          ({plainLen} text)
        </span>
      )}
      {rawLen > maxChars && (
        partCount && partCount > 1 ? (
          <span className="text-amber-400 font-medium">→ {partCount} parts</span>
        ) : (
          <span className="text-red-400 font-medium animate-pulse">Over limit!</span>
        )
      )}
    </div>
  );
}
