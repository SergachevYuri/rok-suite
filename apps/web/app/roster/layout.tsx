'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Users, Upload, History, BarChart3, Calendar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AppSidebar } from '@/components/AppSidebar';

export default function RosterLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const t = useTranslations('roster.tabs');
    const tabs = [
        { label: t('roster'), href: '/roster', icon: Users },
        { label: t('upload'), href: '/roster/upload', icon: Upload },
        { label: t('growth'), href: '/roster/history', icon: History },
        { label: t('analytics'), href: '/roster/analytics', icon: BarChart3 },
        { label: t('events'), href: '/roster/events', icon: Calendar },
    ];

    const isActiveTab = (href: string) => {
        if (href === '/roster') return pathname === '/roster';
        return pathname.startsWith(href);
    };

    return (
        <AppSidebar>
            <div className="min-h-screen">
                {/* Tab Navigation */}
                <div className="sticky top-0 z-30 bg-[var(--background)] border-b border-[var(--border)]">
                    <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
                        <nav className="flex gap-1 overflow-x-auto py-2">
                            {tabs.map((tab) => {
                                const active = isActiveTab(tab.href);
                                const Icon = tab.icon;
                                return (
                                    <Link
                                        key={tab.href}
                                        href={tab.href}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                                            active
                                                ? 'bg-sky-500/15 text-sky-400 shadow-sm'
                                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--background-secondary)]'
                                        }`}
                                    >
                                        <Icon size={16} />
                                        {tab.label}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </div>

                {/* Page Content */}
                {children}
            </div>
        </AppSidebar>
    );
}
