'use client';

import { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import KingdomStats from '@/components/kingdom/KingdomStats';

// Preview pool view — same component as the main Kingdom Stats page but
// restricted to the next-matchmaking KDs (3929–3944) and limited to the
// Table + Comparison tabs. Lives on its own URL so the current-pool view
// stays clean.
export default function PreviewPoolPage() {
  return (
    <AppSidebar>
      <Suspense fallback={<div className="p-8 text-[var(--text-muted)]">Loading...</div>}>
        <KingdomStats pool="preview" basePath="/kingdom/preview-pool" />
      </Suspense>
    </AppSidebar>
  );
}
