'use client';

import Link from 'next/link';
import { Trophy, Calendar, ArrowRight, Target } from 'lucide-react';
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
              <div className="p-2.5 rounded-lg bg-amber-500/15">
                <Trophy size={24} className="text-amber-500" />
              </div>
              <h1 className="text-3xl font-bold">Alliance Events</h1>
            </div>
            <p className="text-[var(--text-secondary)]">
              Track results and rankings from alliance challenges and events.
            </p>
          </div>

          {/* Events List */}
          <div className="space-y-4">
            {allianceEvents.map((event) => (
              <Link key={event.slug} href={`/events/${event.slug}`}>
                <div className="group p-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] hover:border-amber-500/40 hover:bg-[var(--background-hover)] hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-hover)] hover:shadow-amber-500/10 transition-all duration-200 cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-semibold group-hover:text-amber-500 transition-colors">
                          {event.name}
                        </h2>
                        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[event.status]}`}>
                          {event.status}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mb-3">{event.description}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar size={14} className="text-[var(--text-muted)]" />
                        <span className="text-[var(--text-muted)]">{event.dates}</span>
                      </div>
                    </div>
                    <ArrowRight
                      size={20}
                      className="text-[var(--text-muted)] group-hover:text-amber-500 group-hover:translate-x-1 transition-all duration-200 mt-1"
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Empty state for future */}
          {allianceEvents.length === 0 && (
            <div className="p-12 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] text-center">
              <Target size={48} className="text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Events Yet</h3>
              <p className="text-[var(--text-secondary)]">Alliance events will appear here once created.</p>
            </div>
          )}
        </div>
      </div>
    </AppSidebar>
  );
}
