'use client';

import { useState, useMemo } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { Trophy, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import CategoryCard from '@/components/kvk-achievements/CategoryCard';
import { getAchievementData, ALL_SEASONS } from '@/lib/kvk-achievements/data';
import type { KvkSeason, AchievementScope } from '@/lib/kvk-achievements/types';

const SCOPE_TABS: { key: AchievementScope; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'alliance', label: 'Alliance' },
  { key: 'kingdom', label: 'Kingdom' },
];

export default function AchievementsPage() {
  const [season, setSeason] = useState<KvkSeason>('kvk2');
  const [scope, setScope] = useState<AchievementScope>('individual');

  const dataset = useMemo(() => getAchievementData(season), [season]);
  const categories = dataset.scopes[scope];

  const totalTiers = categories.reduce((sum, c) => sum + c.tiers.length, 0);

  return (
    <AppSidebar>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/kvk-map"
            className="inline-flex items-center gap-1 text-xs mb-3 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft size={12} />
            KvK War Room
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Trophy size={28} style={{ color: '#8b5cf6' }} />
              <div>
                <h1
                  className="text-2xl font-bold"
                  style={{ color: 'var(--foreground)' }}
                >
                  KvK Achievements
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Achievement browser &amp; reference
                </p>
              </div>
            </div>

            {/* Season selector */}
            <div
              className="flex rounded-lg overflow-hidden border"
              style={{ borderColor: 'var(--border)' }}
            >
              {ALL_SEASONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSeason(s.id)}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: season === s.id ? '#8b5cf6' : 'var(--background-card)',
                    color: season === s.id ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scope tabs */}
        <div
          className="flex gap-1 mb-6 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {SCOPE_TABS.map((tab) => {
            const count = dataset.scopes[tab.key].length;
            const isActive = scope === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setScope(tab.key)}
                className="px-4 py-2.5 text-sm font-medium transition-colors relative"
                style={{
                  color: isActive ? '#8b5cf6' : 'var(--text-secondary)',
                }}
              >
                {tab.label}
                <span
                  className="ml-1.5 text-xs"
                  style={{ color: isActive ? '#8b5cf6' : 'var(--text-muted)' }}
                >
                  ({count})
                </span>
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: '#8b5cf6' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Summary */}
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {categories.length} {categories.length === 1 ? 'category' : 'categories'},{' '}
          {totalTiers} {totalTiers === 1 ? 'tier' : 'tiers'}
        </p>

        {/* Category cards */}
        <div className="flex flex-col gap-3">
          {categories.map((cat) => (
            <CategoryCard key={cat.id} category={cat} />
          ))}
        </div>
      </div>
    </AppSidebar>
  );
}
