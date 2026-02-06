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
    },
    {
      href: '/rosters',
      titleKey: 'tools.roster.title',
      descriptionKey: 'tools.roster.description',
      icon: Users,
    },
    {
      href: '/events',
      titleKey: 'tools.events.title',
      descriptionKey: 'tools.events.description',
      icon: Trophy,
    },
    {
      href: '/aoo-strategy',
      titleKey: 'tools.aoo.title',
      descriptionKey: 'tools.aoo.description',
      icon: Swords,
    },
  ];

  return (
    <AppSidebar>
      <div className="min-h-screen">
        <div className="max-w-3xl mx-auto px-6 py-20">
          {/* Hero */}
          <section className="mb-16">
            <p className="text-sm font-medium text-slate-500 mb-3 tracking-wide uppercase">
              {t('tagline')}
            </p>
            <h1 className="text-4xl md:text-5xl font-semibold text-white mb-5 tracking-tight leading-tight">
              {t('title')}
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              {t('subtitle')}
            </p>
          </section>

          {/* Tools */}
          <section className="mb-14">
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-5">
              {t('sections.interactiveTools')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.href} href={tool.href}>
                    <div className="group p-5 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-teal-500/30 hover:bg-slate-800/60 transition-all duration-200 cursor-pointer h-full">
                      <div className="flex items-start gap-4">
                        <div className="p-2.5 rounded-lg bg-slate-700/50 group-hover:bg-teal-500/10 transition-colors duration-200 flex-shrink-0">
                          <Icon className="w-5 h-5 text-slate-400 group-hover:text-teal-400 transition-colors duration-200" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-medium text-slate-200 mb-1 group-hover:text-white transition-colors duration-200">
                            {t(tool.titleKey)}
                          </h3>
                          <p className="text-sm text-slate-500 leading-relaxed">
                            {t(tool.descriptionKey)}
                          </p>
                        </div>

                        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Guide */}
          <section className="mb-14">
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-5">
              {t('sections.guides')}
            </h2>

            <Link href="/guide">
              <div className="group p-5 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-teal-500/30 hover:bg-slate-800/60 transition-all duration-200 cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-lg bg-slate-700/50 group-hover:bg-teal-500/10 transition-colors duration-200 flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-slate-400 group-hover:text-teal-400 transition-colors duration-200" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-slate-200 mb-1 group-hover:text-white transition-colors duration-200">
                      {t('guide.title')}
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {t('guide.description')}
                    </p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0 mt-1" />
                </div>
              </div>
            </Link>
          </section>

          {/* Footer */}
          <footer className="pt-8 border-t border-slate-800/50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                {t('footer.copyright')}
              </p>
              <div className="flex items-center gap-5 text-sm">
                <Link
                  href="/beta-tools"
                  className="text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Beta
                </Link>
                <a
                  href="https://github.com/avweigel/rok-suite"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5"
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                </a>
                <a
                  href="https://avweigel.github.io/rok-suite/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5"
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
