'use client';

import { SEED_PALETTE, type SeedAssignment } from '@/lib/kingdom/seed';

export function SeedBadge({ seed }: { seed: SeedAssignment }) {
  if (!seed) return <span className="text-[var(--text-muted)]">–</span>;
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs font-mono font-semibold ${SEED_PALETTE[seed]}`}>
      {seed}
    </span>
  );
}
