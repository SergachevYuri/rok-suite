'use client';

import { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import KingdomStats from '@/components/kingdom/KingdomStats';

export default function KingdomStatsPage() {
  return (
    <AppSidebar>
      <Suspense fallback={<div className="p-8 text-[var(--text-muted)]">Loading...</div>}>
        <KingdomStats />
      </Suspense>
    </AppSidebar>
  );
}
