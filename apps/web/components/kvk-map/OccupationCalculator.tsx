'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import type { IncomeTotals } from './AllianceIncomeSummary';

function formatBigNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.floor(n));
}

interface OccupationCalculatorProps {
  totals: IncomeTotals;
}

export default function OccupationCalculator({ totals }: OccupationCalculatorProps) {
  const [startTime, setStartTime] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null); // minutes

  useEffect(() => {
    if (!startTime) { setElapsed(null); return; }
    const compute = () => {
      const start = new Date(startTime + 'Z').getTime();
      if (isNaN(start)) { setElapsed(null); return; }
      const mins = (Date.now() - start) / 60_000;
      setElapsed(mins > 0 ? mins : 0);
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [startTime]);

  if (totals.allianceHonor === 0 && totals.totalRss === 0) return null;

  const elapsedHours = elapsed !== null ? elapsed / 60 : 0;
  const elapsedLabel = elapsed !== null
    ? `${Math.floor(elapsed / 60)}h ${Math.floor(elapsed % 60)}m`
    : null;

  const totalAllianceHonor = elapsed !== null ? Math.floor(totals.allianceHonor * elapsed) : 0;
  const totalKingdomHonor = elapsed !== null ? Math.floor(totals.kingdomHonor * elapsed) : 0;
  const totalRss = elapsed !== null ? Math.floor(totals.totalRss * elapsedHours) : 0;

  return (
    <div
      className="rounded-lg border p-3"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Occupation Calculator
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <label className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
          Started (UTC)
        </label>
        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="text-[11px] px-2 py-1 rounded border bg-transparent flex-1 min-w-0"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
            colorScheme: 'dark',
          }}
        />
      </div>

      {elapsed !== null && elapsed > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {elapsedLabel} elapsed
          </div>
          <div className="space-y-1 rounded-lg p-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
            {totalAllianceHonor > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>A. Honor</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: '#a78bfa' }}>
                  {formatBigNumber(totalAllianceHonor)}
                </span>
              </div>
            )}
            {totalKingdomHonor > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>K. Honor</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: '#c4b5fd' }}>
                  {formatBigNumber(totalKingdomHonor)}
                </span>
              </div>
            )}
            {totalRss > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>RSS</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: '#fbbf24' }}>
                  {formatBigNumber(totalRss)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
