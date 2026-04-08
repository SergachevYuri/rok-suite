'use client';

import Link from 'next/link';
import { Calendar, Shield, Sparkles, ArrowRight, BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function GuidePage() {
  const t = useTranslations('guide');
  const sections = [
    {
      title: t('events.title'),
      description: t('events.description'),
      href: '/guide/events',
      icon: Calendar,
      hoverBorder: 'hover:border-emerald-500/40',
      hoverShadow: 'hover:shadow-emerald-500/10',
      iconHoverBg: 'group-hover:bg-emerald-500/15',
      iconHoverColor: 'group-hover:text-emerald-500',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
      items: [t('events.items.ark'), t('events.items.mge'), t('events.items.ceroli'), t('events.items.more')],
    },
    {
      title: t('alliance.title'),
      description: t('alliance.description'),
      href: '/guide/alliance',
      icon: Shield,
      hoverBorder: 'hover:border-violet-500/40',
      hoverShadow: 'hover:shadow-violet-500/10',
      iconHoverBg: 'group-hover:bg-violet-500/15',
      iconHoverColor: 'group-hover:text-violet-500',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-500',
      items: [t('alliance.items.guardians'), t('alliance.items.territory'), t('alliance.items.rally'), t('alliance.items.rules')],
    },
    {
      title: t('commanders.title'),
      description: t('commanders.description'),
      href: '/guide/commanders',
      icon: Sparkles,
      hoverBorder: 'hover:border-amber-500/40',
      hoverShadow: 'hover:shadow-amber-500/10',
      iconHoverBg: 'group-hover:bg-amber-500/15',
      iconHoverColor: 'group-hover:text-amber-500',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
      items: [t('commanders.items.path'), t('commanders.items.screenshot'), t('commanders.items.kvk'), t('commanders.items.f2pp2p')],
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
          <h1 className="text-3xl font-bold">{t('hero')}</h1>
        </div>
        <p className="text-[var(--text-secondary)]">{t('heroBody')}</p>
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
          {t('popular')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t('popularLinks.ark'), href: '/guide/events/ark-of-osiris' },
            { label: t('popularLinks.guardians'), href: '/guide/alliance/guardians' },
            { label: t('popularLinks.mge'), href: '/guide/events/mightiest-governor' },
            { label: t('popularLinks.wizard'), href: '/guide/commanders' },
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
