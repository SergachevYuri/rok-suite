'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  Shield,
  Home,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { UserMenu } from '@/components/auth/UserMenu';
import { getTheme } from '@/lib/guide/theme';
import { AppSidebar } from '@/components/AppSidebar';

interface GuideLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: { label: string; href: string }[];
}

const eventItems: NavItem['children'] = [
  { label: 'Ark of Osiris', href: '/guide/events/ark-of-osiris' },
  { label: 'Mightiest Governor', href: '/guide/events/mightiest-governor' },
  { label: 'More Than Gems', href: '/guide/events/more-than-gems' },
  { label: 'Ceroli Crisis', href: '/guide/events/ceroli-crisis' },
  { label: 'Ian\'s Ballads', href: '/guide/events/ians-ballads' },
  { label: 'Karuak Ceremony', href: '/guide/events/karuak-ceremony' },
  { label: 'Sunset Canyon', href: '/guide/events/sunset-canyon' },
  { label: 'Lohar\'s Trial', href: '/guide/events/lohars-trial' },
  { label: 'Golden Kingdom', href: '/guide/events/golden-kingdom' },
  { label: 'Champions of Olympia', href: '/guide/events/champions-of-olympia' },
];

const allianceItems: NavItem['children'] = [
  { label: 'Guardian Runs', href: '/guide/alliance/guardians' },
  { label: 'Territory Policy', href: '/guide/alliance/territory' },
  { label: 'Rally Protocol', href: '/guide/alliance/rallies' },
  { label: 'Alliance Rules', href: '/guide/alliance/rules' },
];

const navItems: NavItem[] = [
  {
    label: 'Overview',
    href: '/guide',
    icon: <Home size={16} />,
  },
  {
    label: 'Events',
    href: '/guide/events',
    icon: <Calendar size={16} />,
    children: eventItems,
  },
  {
    label: 'Alliance',
    href: '/guide/alliance',
    icon: <Shield size={16} />,
    children: allianceItems,
  },
  {
    label: 'Commanders',
    href: '/guide/commanders',
    icon: <Sparkles size={16} />,
  },
];

export function GuideLayout({ children }: GuideLayoutProps) {
  const pathname = usePathname();
  const theme = getTheme();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const isActive = (href: string) => {
    if (href === '/guide') {
      return pathname === '/guide';
    }
    return pathname.startsWith(href);
  };

  const isChildActive = (children?: NavItem['children']) => {
    if (!children) return false;
    return children.some((child) => pathname === child.href);
  };

  const getCurrentSubItem = () => {
    for (const item of navItems) {
      if (item.children) {
        const activeChild = item.children.find(child => pathname === child.href);
        if (activeChild) return activeChild.label;
      }
    }
    return null;
  };

  const currentSubItem = getCurrentSubItem();

  return (
    <AppSidebar>
      <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
        {/* Header with integrated navigation */}
        <header className="sticky top-14 lg:top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
          <div className="max-w-5xl mx-auto">
            {/* Title row */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/15">
                  <BookOpen className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-semibold">Strategy Guide</h1>
                  {currentSubItem && (
                    <p className="text-xs text-[var(--text-muted)]">{currentSubItem}</p>
                  )}
                </div>
              </div>
              <UserMenu />
            </div>

            {/* Navigation tabs */}
            <nav className="flex items-center gap-1 px-4 sm:px-6 pb-3 overflow-x-auto">
              {navItems.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const active = isActive(item.href);
                const childActive = isChildActive(item.children);

                if (hasChildren) {
                  return (
                    <div key={item.href} className="relative">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                          active || childActive
                            ? 'bg-cyan-500/15 text-cyan-500'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                        <ChevronDown size={14} className={`transition-transform ${openDropdown === item.label ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Dropdown menu */}
                      {openDropdown === item.label && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setOpenDropdown(null)}
                          />
                          <div className="absolute top-full left-0 mt-1 py-1 bg-[var(--background-card)] border border-[var(--border)] rounded-lg shadow-lg z-50 min-w-[200px]">
                            {item.children?.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setOpenDropdown(null)}
                                className={`block px-4 py-2 text-sm transition-colors ${
                                  pathname === child.href
                                    ? 'bg-cyan-500/15 text-cyan-500'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]'
                                }`}
                              >
                                {child.label}
                              </Link>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-500'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        {/* Main content - full width now */}
        <main className="max-w-5xl mx-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </AppSidebar>
  );
}
