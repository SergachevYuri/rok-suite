'use client';

import Link from 'next/link';
import { Calendar, Shield, Sparkles, ArrowRight, BookOpen } from 'lucide-react';

export default function GuidePage() {
  const sections = [
    {
      title: 'Events',
      description: 'Game event guides, strategies, and checklists for success',
      href: '/guide/events',
      icon: Calendar,
      hoverBorder: 'hover:border-emerald-500/40',
      hoverShadow: 'hover:shadow-emerald-500/10',
      iconHoverBg: 'group-hover:bg-emerald-500/15',
      iconHoverColor: 'group-hover:text-emerald-500',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
      items: ['Ark of Osiris', 'Mightiest Governor', 'Ceroli Crisis', 'and more...'],
    },
    {
      title: 'Alliance',
      description: 'How we do things - protocols, schedules, and policies',
      href: '/guide/alliance',
      icon: Shield,
      hoverBorder: 'hover:border-violet-500/40',
      hoverShadow: 'hover:shadow-violet-500/10',
      iconHoverBg: 'group-hover:bg-violet-500/15',
      iconHoverColor: 'group-hover:text-violet-500',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-500',
      items: ['Guardian Runs', 'Territory Policy', 'Rally Protocol', 'Alliance Rules'],
    },
    {
      title: 'Commander Strategy',
      description: 'Personalized commander progression and efficiency guides',
      href: '/guide/commanders',
      icon: Sparkles,
      hoverBorder: 'hover:border-amber-500/40',
      hoverShadow: 'hover:shadow-amber-500/10',
      iconHoverBg: 'group-hover:bg-amber-500/15',
      iconHoverColor: 'group-hover:text-amber-500',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
      items: ['Choose your path', 'Screenshot analysis', 'KvK preparation', 'F2P & P2P guides'],
    },
  ];

  return (
    <div>
      {/* Hero */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-cyan-500/15">
            <BookOpen size={24} className="text-cyan-500" />
          </div>
          <h1 className="text-3xl font-bold">Strategy Guide</h1>
        </div>
        <p className="text-[var(--text-secondary)]">
          Comprehensive guides for Rise of Kingdoms events, alliance coordination, and commander progression.
          Everything you need to dominate the battlefield.
        </p>
      </div>

      {/* Section Cards */}
      <div className="grid gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <div
                className={`group p-6 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] ${section.hoverBorder} hover:bg-[var(--background-hover)] hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-hover)] ${section.hoverShadow} transition-all duration-200 cursor-pointer`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2.5 rounded-lg ${section.iconBg} ${section.iconHoverBg} transition-colors duration-200`}>
                        <Icon size={22} className={`${section.iconColor} ${section.iconHoverColor} transition-colors duration-200`} />
                      </div>
                      <h2 className={`text-xl font-semibold ${section.iconHoverColor} transition-colors duration-200`}>
                        {section.title}
                      </h2>
                    </div>
                    <p className="text-[var(--text-secondary)] mb-4">{section.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {section.items.map((item) => (
                        <span
                          key={item}
                          className="text-xs px-2.5 py-1 rounded-md bg-[var(--background-secondary)] text-[var(--text-muted)]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight
                    size={20}
                    className={`text-[var(--text-muted)] ${section.iconHoverColor} group-hover:translate-x-1 transition-all duration-200 mt-1`}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Links */}
      <div className="mt-10 pt-8 border-t border-[var(--border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
          Popular Guides
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Ark of Osiris', href: '/guide/events/ark-of-osiris' },
            { label: 'Guardian Runs', href: '/guide/alliance/guardians' },
            { label: 'MGE Strategy', href: '/guide/events/mightiest-governor' },
            { label: 'Commander Wizard', href: '/guide/commanders' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm px-3 py-2.5 rounded-lg bg-[var(--background-card)] border border-[var(--border)] hover:bg-[var(--background-hover)] hover:border-[var(--border-hover)] transition-colors text-center"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
