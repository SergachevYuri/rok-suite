'use client';

import { useState, useMemo } from 'react';
import CategoryCard from '@/components/kvk-achievements/CategoryCard';
import { getAchievementData, ALL_SEASONS } from '@/lib/kvk-achievements/data';
import type { KvkSeason, AchievementScope } from '@/lib/kvk-achievements/types';

const SCOPE_TABS: { key: AchievementScope; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'alliance', label: 'Alliance' },
  { key: 'kingdom', label: 'Kingdom' },
];

export default function AchievementSidebar() {
  const [season, setSeason] = useState<KvkSeason>('kvk2');
  const [scope, setScope] = useState<AchievementScope>('individual');

  const dataset = useMemo(() => getAchievementData(season), [season]);
  const categories = dataset.scopes[scope];

  return (
    <div
      className="rounded-xl border"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      <div className="p-3 space-y-3">
        {/* Header */}
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Achievements
        </h3>

        {/* Season selector */}
        <div
          className="flex rounded-md overflow-hidden border"
          style={{ borderColor: 'var(--border)' }}
        >
          {ALL_SEASONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeason(s.id)}
              className="flex-1 px-2 py-1 text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: season === s.id ? '#8b5cf6' : 'transparent',
                color: season === s.id ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scope tabs */}
        <div className="flex gap-0.5">
          {SCOPE_TABS.map((tab) => {
            const isActive = scope === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setScope(tab.key)}
                className="flex-1 text-[10px] font-medium py-1.5 rounded transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--background-hover)' : 'transparent',
                  color: isActive ? 'var(--foreground)' : 'var(--text-muted)',
                }}
              >
                {tab.label}
                <span className="ml-0.5 opacity-60">({dataset.scopes[tab.key].length})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category cards */}
      <div className="px-3 pb-3 space-y-2">
        {categories.map((cat) => (
          <CategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  );
}
