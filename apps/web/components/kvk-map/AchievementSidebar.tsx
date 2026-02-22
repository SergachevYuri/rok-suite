'use client';

import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { getAchievementData, ALL_SEASONS } from '@/lib/kvk-achievements/data';
import { formatTarget } from '@/lib/kvk-achievements/normalize';
import type { KvkSeason, AchievementScope, AchievementCategory, AchievementTier } from '@/lib/kvk-achievements/types';

const SCOPE_TABS: { key: AchievementScope; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'alliance', label: 'Alliance' },
  { key: 'kingdom', label: 'Kingdom' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

function TierRow({ tier }: { tier: AchievementTier }) {
  return (
    <div
      className="flex items-start gap-2 px-2.5 py-2"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <span
        className="text-xs font-bold w-5 shrink-0 pt-0.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {ROMAN[tier.level - 1] || tier.level}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug" style={{ color: 'var(--foreground)' }}>
          {tier.task}
        </p>
        {tier.requirements.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tier.requirements.map((req, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
              >
                {formatTarget(req.target)} {req.label}
              </span>
            ))}
          </div>
        )}
        {tier.rewards && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {tier.rewards}
          </p>
        )}
      </div>
    </div>
  );
}

function CategoryAccordion({ category }: { category: AchievementCategory }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={category.kvk3Only ? 'opacity-50' : ''}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors"
        style={{
          backgroundColor: open ? 'var(--background-hover)' : 'transparent',
        }}
      >
        <ChevronRight
          size={12}
          className="shrink-0 transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
        <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--foreground)' }}>
          {category.name}
        </span>
        {category.kvk3Only && (
          <span
            className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0"
            style={{ backgroundColor: 'var(--background-hover)', color: 'var(--text-muted)' }}
          >
            KvK3
          </span>
        )}
        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
          {category.tiers.length}
        </span>
      </button>
      {open && (
        <div className="ml-1 mb-1 rounded-md overflow-hidden" style={{ backgroundColor: 'var(--background-card)' }}>
          {category.tiers.map((tier) => (
            <TierRow key={tier.level} tier={tier} />
          ))}
        </div>
      )}
    </div>
  );
}

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
      <div className="p-3 space-y-2">
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
              className="flex-1 px-2 py-1.5 text-xs font-medium transition-colors"
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
                className="flex-1 text-xs font-medium py-1.5 rounded transition-colors"
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

      {/* Category accordions */}
      <div className="px-2 pb-2">
        {categories.map((cat) => (
          <CategoryAccordion key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  );
}
