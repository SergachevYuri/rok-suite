'use client';

import Link from 'next/link';
import { Trophy, Calendar, ArrowRight, Target } from 'lucide-react';
import { getTheme } from '@/lib/guide/theme';
import { AppSidebar } from '@/components/AppSidebar';

interface AllianceEvent {
  slug: string;
  name: string;
  dates: string;
  status: 'active' | 'completed' | 'upcoming';
  description: string;
}

const allianceEvents: AllianceEvent[] = [
  {
    slug: 'kp-push-jan-2026',
    name: 'KP Push Challenge',
    dates: 'Jan 12 - Jan 27, 2026',
    status: 'completed',
    description: 'Alliance-wide challenge to increase KP with a 1:1 power:KP ratio goal',
  },
];

export default function EventsPage() {
  const theme = getTheme();

  const statusColors = {
    active: 'bg-green-500/20 text-green-400',
    completed: 'bg-blue-500/20 text-blue-400',
    upcoming: 'bg-amber-500/20 text-amber-400',
  };

  return (
    <AppSidebar>
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Trophy size={24} className="text-emerald-400" />
              </div>
              <h1 className="text-3xl font-bold">Alliance Events</h1>
            </div>
            <p className={theme.textMuted}>
              Track results and rankings from alliance challenges and events.
            </p>
          </div>

          {/* Events List */}
          <div className="space-y-4">
            {allianceEvents.map((event) => (
              <Link key={event.slug} href={`/events/${event.slug}`}>
                <div className={`${theme.card} border rounded-lg p-6 transition-all hover:border-emerald-500/50 cursor-pointer group`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-semibold group-hover:text-emerald-400 transition-colors">
                          {event.name}
                        </h2>
                        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[event.status]}`}>
                          {event.status}
                        </span>
                      </div>
                      <p className={`text-sm ${theme.textMuted} mb-3`}>{event.description}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar size={14} className={theme.textMuted} />
                        <span className={theme.textMuted}>{event.dates}</span>
                      </div>
                    </div>
                    <ArrowRight
                      size={20}
                      className={`${theme.textMuted} group-hover:text-emerald-400 transition-colors mt-1`}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Empty state for future */}
          {allianceEvents.length === 0 && (
            <div className={`${theme.card} border rounded-lg p-12 text-center`}>
              <Target size={48} className={`${theme.textMuted} mx-auto mb-4`} />
              <h3 className="text-lg font-medium mb-2">No Events Yet</h3>
              <p className={theme.textMuted}>Alliance events will appear here once created.</p>
            </div>
          )}
        </div>
      </div>
    </AppSidebar>
  );
}
