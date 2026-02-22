'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AppSidebar } from '@/components/AppSidebar';
import { WarRoomAuthProvider } from '@/lib/kvk-map/war-room-auth';

const WarRoomPage = dynamic(
  () => import('@/components/kvk-map/WarRoomPage'),
  { ssr: false }
);

export default function KvkMapPage() {
  return (
    <AppSidebar>
      <WarRoomAuthProvider>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="w-5 h-5 border border-[#4318ff] border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <WarRoomPage />
        </Suspense>
      </WarRoomAuthProvider>
    </AppSidebar>
  );
}
