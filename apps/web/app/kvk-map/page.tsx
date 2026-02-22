'use client';

import { AppSidebar } from '@/components/AppSidebar';
import { Map, Wrench, Trophy, Users, Eye } from 'lucide-react';
import Link from 'next/link';

const modes = [
  {
    href: '/kvk-map/admin',
    icon: Wrench,
    title: 'Map Builder',
    subtitle: 'Admin',
    description:
      'Annotate the KvK map with passes, shrines, altars, and other features. Define buffs and achievements.',
    color: '#f59e0b',
  },
  {
    href: '/kvk-map/achievements',
    icon: Trophy,
    title: 'Achievement Browser',
    subtitle: 'Reference',
    description:
      'Browse all KvK achievements by season with requirements, tiers, and rewards.',
    color: '#8b5cf6',
  },
  {
    href: '/kvk-map',
    icon: Eye,
    title: 'Viewer',
    subtitle: 'Members',
    description:
      'See the completed plan with alliance-colored markers, achievement progress, and buff overview.',
    color: '#22c55e',
    disabled: true,
  },
];

export default function KvkMapPage() {
  return (
    <AppSidebar>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Map size={28} className="text-orange-500" />
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--foreground)' }}
            >
              KvK War Room
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Interactive KvK map planning tool
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {modes.map((mode) => {
            const Icon = mode.icon;
            const content = (
              <div
                className={`p-6 rounded-xl border transition-all ${
                  mode.disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:border-[var(--border-hover)]'
                }`}
                style={{
                  backgroundColor: 'var(--background-card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${mode.color}20` }}
                  >
                    <Icon size={18} style={{ color: mode.color }} />
                  </div>
                  <div>
                    <h2
                      className="text-lg font-semibold"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {mode.title}
                    </h2>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {mode.subtitle}
                    </span>
                  </div>
                  {mode.disabled && (
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: 'var(--background-hover)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Coming soon
                    </span>
                  )}
                </div>
                <p
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {mode.description}
                </p>
              </div>
            );

            if (mode.disabled) {
              return <div key={mode.title}>{content}</div>;
            }

            return (
              <Link key={mode.title} href={mode.href} className="block">
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </AppSidebar>
  );
}
