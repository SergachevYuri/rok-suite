'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Calendar,
  Users,
  Swords,
  BookOpen,
  FlaskConical,
  Home,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

const navItems: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    icon: <Home size={20} />,
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: <Calendar size={20} />,
  },
  {
    label: 'Roster',
    href: '/roster',
    icon: <Users size={20} />,
  },
  {
    label: 'AoO Planner',
    href: '/aoo-strategy',
    icon: <Swords size={20} />,
  },
  {
    label: 'Guide',
    href: '/guide',
    icon: <BookOpen size={20} />,
  },
  {
    label: 'Beta Tools',
    href: '/beta-tools',
    icon: <FlaskConical size={20} />,
    badge: 'WIP',
    badgeColor: 'bg-[#ffb547]/20 text-[#ffb547]',
  },
];

interface AppSidebarProps {
  children: React.ReactNode;
}

export function AppSidebar({ children }: AppSidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-[var(--border)] ${isCollapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4318ff] to-[#9f7aea] flex items-center justify-center shadow-lg shadow-[#4318ff]/25 flex-shrink-0">
          <Swords className="w-5 h-5 text-white" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-[var(--foreground)] truncate">RoK Suite</h1>
            <p className="text-[10px] text-[var(--text-muted)] truncate">Angmar Nazgul Guards</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                active
                  ? 'bg-[#4318ff] text-white shadow-lg shadow-[#4318ff]/25'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-[var(--text-muted)] group-hover:text-[var(--foreground)]'}`}>
                {item.icon}
              </span>
              {!isCollapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className={`px-3 py-4 border-t border-[var(--border)] ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <span className="text-xs text-[var(--text-muted)]">Theme</span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-[var(--background-card)] border-r border-[var(--border)] transition-all duration-300 z-40 ${
          isCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <SidebarContent />

        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[var(--background-card)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-colors shadow-sm"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[var(--background-card)] border-b border-[var(--border)] flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4318ff] to-[#9f7aea] flex items-center justify-center">
              <Swords className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-[var(--foreground)]">RoK Suite</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden fixed left-0 top-0 h-screen w-64 bg-[var(--background-card)] border-r border-[var(--border)] z-50 transform transition-transform duration-300 flex flex-col ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors"
        >
          <X size={20} />
        </button>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          isCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64'
        } pt-14 lg:pt-0`}
      >
        {children}
      </main>
    </div>
  );
}
