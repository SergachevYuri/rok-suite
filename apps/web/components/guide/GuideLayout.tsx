'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, BookOpen } from 'lucide-react';
import { UserMenu } from '@/components/auth/UserMenu';
import { GuideSidebar } from './GuideSidebar';
import { getTheme } from '@/lib/guide/theme';
import { AppSidebar } from '@/components/AppSidebar';

interface GuideLayoutProps {
  children: React.ReactNode;
}

export function GuideLayout({ children }: GuideLayoutProps) {
  const [guideSidebarOpen, setGuideSidebarOpen] = useState(false);
  const theme = getTheme();

  return (
    <AppSidebar>
    <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Guide sidebar toggle - Mobile */}
            <button
              onClick={() => setGuideSidebarOpen(!guideSidebarOpen)}
              className={`lg:hidden p-2 rounded-lg ${theme.button}`}
              title="Toggle guide navigation"
            >
              {guideSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#9f7aea] to-[#4318ff] flex items-center justify-center shadow-lg shadow-[#9f7aea]/25">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <h1 className="font-semibold">Strategy Guide</h1>
            </div>
          </div>

          <UserMenu />
        </div>
      </header>

      <div className="relative flex">
        {/* Guide Sidebar - Desktop */}
        <aside
          className={`hidden lg:block w-64 shrink-0 ${theme.sidebar} border-r border-[var(--border)] sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto`}
        >
          <div className="p-4">
            <GuideSidebar theme={theme} />
          </div>
        </aside>

        {/* Guide Sidebar - Mobile overlay */}
        {guideSidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setGuideSidebarOpen(false)}
            />
            <aside
              className={`fixed left-0 top-[57px] bottom-0 w-64 ${theme.bgSecondary} border-r border-[var(--border)] z-50 overflow-y-auto lg:hidden`}
            >
              <div className="p-4">
                <GuideSidebar theme={theme} />
              </div>
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
    </AppSidebar>
  );
}
