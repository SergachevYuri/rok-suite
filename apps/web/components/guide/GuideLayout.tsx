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

  // Guide header height: 57px on desktop, stacked below AppSidebar mobile header (56px) on mobile
  // Total mobile top offset = 56px (AppSidebar) + 57px (Guide header) = 113px
  const guideHeaderHeight = 57;
  const mobileTopOffset = 56 + guideHeaderHeight; // 113px

  return (
    <AppSidebar>
    <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
      {/* Header */}
      <header className="sticky top-14 lg:top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Guide sidebar toggle - Mobile */}
            <button
              onClick={() => setGuideSidebarOpen(!guideSidebarOpen)}
              className={`lg:hidden p-2 rounded-lg ${theme.button}`}
              title="Toggle guide navigation"
            >
              {guideSidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#9f7aea] to-[#4318ff] flex items-center justify-center shadow-lg shadow-[#9f7aea]/25">
                <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
              </div>
              <h1 className="text-sm sm:text-base font-semibold">Strategy Guide</h1>
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
              className={`fixed left-0 bottom-0 w-64 ${theme.bgSecondary} border-r border-[var(--border)] z-50 overflow-y-auto lg:hidden`}
              style={{ top: `${mobileTopOffset}px` }}
            >
              <div className="p-4">
                <GuideSidebar theme={theme} />
              </div>
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
    </AppSidebar>
  );
}
