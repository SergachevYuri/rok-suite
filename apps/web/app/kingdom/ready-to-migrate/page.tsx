'use client';

import { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import ReadyToMigrate from '@/components/kingdom/ReadyToMigrate';

export default function ReadyToMigratePage() {
  return (
    <AppSidebar>
      <Suspense fallback={<div className="p-8 text-[var(--text-muted)]">Loading...</div>}>
        <ReadyToMigrate />
      </Suspense>
    </AppSidebar>
  );
}
