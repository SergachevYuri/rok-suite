'use client';

import Link from 'next/link';
import { AppSidebar } from '@/components/AppSidebar';
import {
  Swords,
  BookOpen,
  ArrowRight,
  Github,
  ExternalLink,
  Sparkles,
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
      gradient: 'from-[#f56565] to-[#ed8936]',
      shadowColor: 'shadow-[#f56565]/20',
      badge: { textKey: 'tools.calendar.badge', color: 'bg-[#f56565]/15 text-[#f56565]' },
    },
    {
      href: '/rosters',
      titleKey: 'tools.roster.title',
      descriptionKey: 'tools.roster.description',
      icon: Users,
      gradient: 'from-[#4318ff] to-[#9f7aea]',
      shadowColor: 'shadow-[#4318ff]/20',
      badge: { textKey: 'tools.roster.badge', color: 'bg-[#4318ff]/15 text-[#9f7aea]' },
    },
    {
      href: '/events',
      titleKey: 'tools.events.title',
      descriptionKey: 'tools.events.description',
      icon: Trophy,
      gradient: 'from-[#f59e0b] to-[#eab308]',
      shadowColor: 'shadow-[#f59e0b]/20',
      badge: { textKey: 'tools.events.badge', color: 'bg-[#f59e0b]/15 text-[#f59e0b]' },
    },
    {
      href: '/aoo-strategy',
      titleKey: 'tools.aoo.title',
      descriptionKey: 'tools.aoo.description',
      icon: Swords,
      gradient: 'from-[var(--success)] to-[var(--success-light)]',
      shadowColor: 'shadow-[var(--success)]/20',
      badge: { textKey: 'tools.aoo.badge', color: 'bg-[var(--success)]/15 text-[var(--success)]' },
    },
  ];

  return (
    <AppSidebar>
      <div className="min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Hero */}
          <section className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 mb-6">
              <Sparkles className="w-4 h-4 text-[var(--primary-light)]" />
              <span className="text-sm font-medium text-[var(--primary-light)]">{t('tagline')}</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-[var(--foreground)] mb-4 tracking-tight">
              {t('title')}
            </h2>
            <p className="text-lg text-[var(--text-secondary)] mb-2">
              {t('subtitle')}
            </p>
            <p className="text-sm text-[var(--primary)]">
              {t('builtFor')}
            </p>
          </section>

          {/* Interactive Tools */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t('sections.interactiveTools')}
              </h3>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <div className="grid gap-3">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.href} href={tool.href}>
                    <div className="group relative p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-all duration-200 cursor-pointer">
                      <div className="flex items-center gap-4">
                        {/* Icon */}
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${tool.gradient} shadow-lg ${tool.shadowColor} flex-shrink-0`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-[var(--foreground)]">
                              {t(tool.titleKey)}
                            </h4>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${tool.badge.color}`}>
                              {t(tool.badge.textKey)}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)]">{t(tool.descriptionKey)}</p>
                        </div>

                        {/* Arrow */}
                        <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Guides & Documentation */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t('sections.guides')}
              </h3>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <Link href="/guide">
              <div className="group relative p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-[#9f7aea] to-[#4318ff] shadow-lg shadow-[#9f7aea]/20 flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">
                        {t('guide.title')}
                      </h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#9f7aea]/15 text-[#9f7aea]">
                        {t('guide.badge')}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t('guide.description')}
                    </p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </div>
            </Link>
          </section>

          {/* Beta Tools */}
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t('sections.experimental')}
              </h3>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <Link href="/beta-tools">
              <div className="group relative p-4 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-[var(--warning)] to-[#fbbf24] shadow-lg shadow-[var(--warning)]/20 flex-shrink-0">
                    <FlaskConical className="w-5 h-5 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">
                        {t('beta.title')}
                      </h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[var(--warning)]/15 text-[var(--warning)]">
                        {t('beta.badge')}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t('beta.description')}
                    </p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </div>
            </Link>
          </section>

          {/* Footer */}
          <footer className="pt-8 border-t border-[var(--border)] text-center">
            <div className="flex items-center justify-center gap-6 mb-4">
              <a
                href="https://github.com/avweigel/rok-suite"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
              >
                <Github className="w-3.5 h-3.5" />
                {t('footer.github')}
              </a>
              <span className="text-[var(--border)]">•</span>
              <a
                href="https://avweigel.github.io/rok-suite/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('footer.documentation')}
              </a>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {t('footer.copyright')}
            </p>
          </footer>
        </div>
      </div>
    </AppSidebar>
  );
}
