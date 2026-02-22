'use client';

import { useState } from 'react';
import { ChevronDown, Award } from 'lucide-react';
import type { AchievementCategory } from '@/lib/kvk-achievements/types';
import TierTable from './TierTable';

interface CategoryCardProps {
  category: AchievementCategory;
}

export default function CategoryCard({ category }: CategoryCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-xl border transition-all ${category.kvk3Only ? 'opacity-50' : ''}`}
      style={{
        backgroundColor: 'var(--background-card)',
        borderColor: open ? 'var(--border-hover)' : 'var(--border)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className="text-lg shrink-0">
          {category.icon || <Award size={18} style={{ color: 'var(--text-muted)' }} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {category.name}
            </h3>
            {category.kvk3Only && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: 'var(--background-hover)',
                  color: 'var(--text-muted)',
                }}
              >
                KvK3 only
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {category.description}
          </p>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full shrink-0"
          style={{
            backgroundColor: 'var(--background-hover)',
            color: 'var(--text-secondary)',
          }}
        >
          {category.tiers.length} {category.tiers.length === 1 ? 'tier' : 'tiers'}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {open && (
        <div
          className="px-4 pb-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="pt-3">
            <TierTable tiers={category.tiers} />
          </div>
        </div>
      )}
    </div>
  );
}
