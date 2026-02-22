'use client';

import { AppSidebar } from '@/components/AppSidebar';
import KingdomStats from '@/components/kingdom/KingdomStats';

export default function KingdomStatsPage() {
  return (
    <AppSidebar>
      <KingdomStats />
    </AppSidebar>
  );
}
