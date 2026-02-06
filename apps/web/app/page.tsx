'use client';

import Link from 'next/link';
import { AppSidebar } from '@/components/AppSidebar';
import {
  Swords,
  BookOpen,
  ArrowRight,
  Github,
  ExternalLink,
  Calendar,
  FlaskConical,
  Users,
  Trophy,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('home');

  const tools = [
    {
      href: '/calendar',
      titleKey: 'tools.calendar.title',
      descriptionKey: 'tools.calendar.description',
      icon: Calendar,
      iconBg: 'bg-rose-500/10',
      iconColor: 'text-rose-400',
      badge: { textKey: 'tools.calendar.badge', color: 'bg-rose-500/10 text-rose-400' },
    },
    {
      href: '/rosters',
      titleKey: 'tools.roster.title',
      descriptionKey: 'tools.roster.description',
      icon: Users,
      iconBg: 'bg-indigo-500/10',
      iconColor: 'text-indigo-400',
      badge: { textKey: 'tools.roster.badge', color: 'bg-indigo-500/10 text-indigo-400' },
    },
    {
      href: '/events',
      titleKey: 'tools.events.title',
      descriptionKey: 'tools.events.description',
      icon: Trophy,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      badge: { textKey: 'tools.events.badge', color: 'bg-amber-500/10 text-amber-400' },
    },
    {
      href: '/aoo-strategy',
      titleKey: 'tools.aoo.title',
      descriptionKey: 'tools.aoo.description',
      icon: Swords,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      badge: { textKey: 'tools.aoo.badge', color: 'bg-emerald-500/10 text-emerald-400' },
    },
  ];

  return (
    <AppSidebar>
      <div className="min-h-screen">
        <div className="max-w-3xl mx-auto px-6 py-16">
          {/* Hero - cleaner, more confident */}
          <section className="mb-20">
            <p className="text-sm font-medium text-indigo-400 mb-3 tracking-wide">
              {t('tagline')}
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-[var(--foreground)] mb-5 tracking-tight leading-tight">
              {t('title')}
            </h1>
            <p className="text-xl text-[var(--text-secondary)] leading-relaxed">
              {t('subtitle')}
            </p>
          </section>

          {/* Interactive Tools - cleaner cards */}
          <section className="mb-16">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-6">
              {t('sections.interactiveTools')}
            </h2>

            <div className="space-y-3">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.href} href={tool.href}>
                    <div className="group relative p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--background-hover)] transition-all duration-200 cursor-pointer">
                      <div className="flex items-center gap-5">
                        {/* Icon - simpler, no gradient */}
                        <div className={`p-3.5 rounded-xl ${tool.iconBg} flex-shrink-0`}>
                          <Icon className={`w-5 h-5 ${tool.iconColor}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1.5">
                            <h3 className="text-base font-semibold text-[var(--foreground)]">
                              {t(tool.titleKey)}
                            </h3>
                            <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full uppercase tracking-wider ${tool.badge.color}`}>
                              {t(tool.badge.textKey)}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            {t(tool.descriptionKey)}
                          </p>
                        </div>

                        {/* Arrow */}
                        <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all duration-200 flex-shrink-0" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Guides & Documentation */}
          <section className="mb-16">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-6">
              {t('sections.guides')}
            </h2>

            <Link href="/guide">
              <div className="group relative p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--background-hover)] transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-5">
                  <div className="p-3.5 rounded-xl bg-violet-500/10 flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-violet-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="text-base font-semibold text-[var(--foreground)]">
                        {t('guide.title')}
                      </h3>
                      <span className="text-[10px] font-medium px-2.5 py-1 rounded-full uppercase tracking-wider bg-violet-500/10 text-violet-400">
                        {t('guide.badge')}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {t('guide.description')}
                    </p>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all duration-200 flex-shrink-0" />
                </div>
              </div>
            </Link>
          </section>

          {/* Beta Tools */}
          <section className="mb-20">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-6">
              {t('sections.experimental')}
            </h2>

            <Link href="/beta-tools">
              <div className="group relative p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--background-hover)] transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-5">
                  <div className="p-3.5 rounded-xl bg-amber-500/10 flex-shrink-0">
                    <FlaskConical className="w-5 h-5 text-amber-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="text-base font-semibold text-[var(--foreground)]">
                        {t('beta.title')}
                      </h3>
                      <span className="text-[10px] font-medium px-2.5 py-1 rounded-full uppercase tracking-wider bg-amber-500/10 text-amber-400">
                        {t('beta.badge')}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {t('beta.description')}
                    </p>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all duration-200 flex-shrink-0" />
                </div>
              </div>
            </Link>
          </section>

          {/* Footer - simpler */}
          <footer className="pt-10 border-t border-[var(--border)]">
            <div className="flex items-center justify-center gap-8 mb-5">
              <a
                href="https://github.com/avweigel/rok-suite"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-2"
              >
                <Github className="w-4 h-4" />
                {t('footer.github')}
              </a>
              <a
                href="https://avweigel.github.io/rok-suite/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                {t('footer.documentation')}
              </a>
            </div>
            <p className="text-sm text-[var(--text-muted)] text-center">
              {t('footer.copyright')}
            </p>
          </footer>
        </div>
      </div>
    </AppSidebar>
  );
}
