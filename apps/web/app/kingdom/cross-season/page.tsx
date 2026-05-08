'use client';

import { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import CrossSeason from '@/components/kingdom/CrossSeason';

export default function CrossSeasonPage() {
  return (
    <AppSidebar>
      <Suspense fallback={<div className="p-8 text-[var(--text-muted)]">Loading...</div>}>
        <CrossSeason />
      </Suspense>
    </AppSidebar>
  );
}
