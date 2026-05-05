'use client';

import { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import MigrationOutreach from '@/components/kingdom/MigrationOutreach';

export default function MigrationOutreachPage() {
  return (
    <AppSidebar>
      <Suspense fallback={<div className="p-8 text-[var(--text-muted)]">Loading...</div>}>
        <MigrationOutreach />
      </Suspense>
    </AppSidebar>
  );
}
