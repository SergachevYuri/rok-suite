'use client';

import type { AchievementTier } from '@/lib/kvk-achievements/types';
import { formatTarget } from '@/lib/kvk-achievements/normalize';

interface TierTableProps {
  tiers: AchievementTier[];
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

export default function TierTable({ tiers }: TierTableProps) {
  const hasRewards = tiers.some((t) => t.rewards);
  const hasRequirements = tiers.some((t) => t.requirements.length > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-left text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <th className="pb-2 pr-3 w-12 font-medium">Tier</th>
            <th className="pb-2 pr-3 font-medium">Task</th>
            {hasRequirements && (
              <th className="pb-2 pr-3 font-medium">Requirements</th>
            )}
            {hasRewards && (
              <th className="pb-2 font-medium">Rewards</th>
            )}
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <tr
              key={tier.level}
              className="transition-colors"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <td
                className="py-2 pr-3 font-semibold text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                {ROMAN[tier.level - 1] || tier.level}
              </td>
              <td className="py-2 pr-3" style={{ color: 'var(--foreground)' }}>
                {tier.task}
              </td>
              {hasRequirements && (
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {tier.requirements.map((req, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                        style={{
                          backgroundColor: 'var(--background-hover)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {formatTarget(req.target)} {req.label}
                      </span>
                    ))}
                  </div>
                </td>
              )}
              {hasRewards && (
                <td
                  className="py-2 text-xs"
                  style={{ color: tier.rewards ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                >
                  {tier.rewards || '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
