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
      hoverBorder: 'hover:border-rose-500/40',
      hoverShadow: 'hover:shadow-rose-500/10',
      iconHoverBg: 'group-hover:bg-rose-500/15',
      iconHoverColor: 'group-hover:text-rose-500',
    },
    {
      href: '/rosters',
      titleKey: 'tools.roster.title',
      descriptionKey: 'tools.roster.description',
      icon: Users,
      hoverBorder: 'hover:border-sky-500/40',
      hoverShadow: 'hover:shadow-sky-500/10',
      iconHoverBg: 'group-hover:bg-sky-500/15',
      iconHoverColor: 'group-hover:text-sky-500',
    },
    {
      href: '/events',
      titleKey: 'tools.events.title',
      descriptionKey: 'tools.events.description',
      icon: Trophy,
      hoverBorder: 'hover:border-amber-500/40',
      hoverShadow: 'hover:shadow-amber-500/10',
      iconHoverBg: 'group-hover:bg-amber-500/15',
      iconHoverColor: 'group-hover:text-amber-500',
    },
    {
      href: '/aoo-strategy',
      titleKey: 'tools.aoo.title',
      descriptionKey: 'tools.aoo.description',
      icon: Swords,
      hoverBorder: 'hover:border-emerald-500/40',
      hoverShadow: 'hover:shadow-emerald-500/10',
      iconHoverBg: 'group-hover:bg-emerald-500/15',
      iconHoverColor: 'group-hover:text-emerald-500',
    },
  ];

  return (
    <AppSidebar>
      <div className="min-h-screen">
        <div className="max-w-3xl mx-auto px-6 py-20">
          {/* Hero */}
          <section className="mb-16">
            <p className="text-sm font-medium text-[var(--text-muted)] mb-3 tracking-wide uppercase">
              {t('tagline')}
            </p>
            <h1 className="text-4xl md:text-5xl font-semibold text-[var(--foreground)] mb-5 tracking-tight leading-tight">
              {t('title')}
            </h1>
            <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
              {t('subtitle')}
            </p>
          </section>

          {/* Tools */}
          <section className="mb-14">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-5">
              {t('sections.interactiveTools')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.href} href={tool.href}>
                    <div className={`group p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] ${tool.hoverBorder} hover:bg-[var(--background-hover)] hover:-translate-y-0.5 hover:shadow-lg ${tool.hoverShadow} transition-all duration-200 cursor-pointer h-full`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-2.5 rounded-lg bg-[var(--background-secondary)] ${tool.iconHoverBg} transition-colors duration-200 flex-shrink-0`}>
                          <Icon className={`w-5 h-5 text-[var(--text-muted)] ${tool.iconHoverColor} transition-colors duration-200`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-medium text-[var(--foreground)] mb-1 transition-colors duration-200">
                            {t(tool.titleKey)}
                          </h3>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            {t(tool.descriptionKey)}
                          </p>
                        </div>

                        <ArrowRight className={`w-4 h-4 text-[var(--text-muted)] ${tool.iconHoverColor} group-hover:translate-x-1 transition-all duration-200 flex-shrink-0 mt-1`} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Guide */}
          <section className="mb-14">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-5">
              {t('sections.guides')}
            </h2>

            <Link href="/guide">
              <div className="group p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] hover:border-cyan-500/40 hover:bg-[var(--background-hover)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200 cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-lg bg-[var(--background-secondary)] group-hover:bg-cyan-500/15 transition-colors duration-200 flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-[var(--text-muted)] group-hover:text-cyan-500 transition-colors duration-200" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-[var(--foreground)] mb-1 transition-colors duration-200">
                      {t('guide.title')}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {t('guide.description')}
                    </p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-cyan-500 group-hover:translate-x-1 transition-all duration-200 flex-shrink-0 mt-1" />
                </div>
              </div>
            </Link>
          </section>

          {/* Footer */}
          <footer className="pt-8 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-muted)]">
                {t('footer.copyright')}
              </p>
              <div className="flex items-center gap-5 text-sm">
                <Link
                  href="/beta-tools"
                  className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Beta
                </Link>
                <a
                  href="https://github.com/avweigel/rok-suite"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                </a>
                <a
                  href="https://avweigel.github.io/rok-suite/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Docs
                </a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </AppSidebar>
  );
}
