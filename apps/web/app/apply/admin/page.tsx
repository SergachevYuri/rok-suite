'use client';

import { AppSidebar } from '@/components/AppSidebar';
import { AuthGate } from '@/components/AuthGate';
import { LeaderApplicationsAdmin } from '@/components/apply/LeaderApplicationsAdmin';

export default function LeaderApplicationsAdminPage() {
  return (
    <AppSidebar>
      <AuthGate require="admin">
        <div className="min-h-screen">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
            <header className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--foreground)] tracking-tight">
                Leader applications
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Review rally and garrison leader submissions. Filter by status, search by name or
                gov ID, and update the status as you process each one.
              </p>
            </header>

            <LeaderApplicationsAdmin />
          </div>
        </div>
      </AuthGate>
    </AppSidebar>
  );
}
