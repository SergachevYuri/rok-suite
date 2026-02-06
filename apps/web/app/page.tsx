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
      color: 'rose',
      iconBg: 'bg-rose-500/15 group-hover:bg-rose-500/25',
      iconColor: 'text-rose-400',
      hoverBorder: 'group-hover:border-rose-500/30',
      hoverGlow: 'group-hover:shadow-rose-500/10',
    },
    {
      href: '/rosters',
      titleKey: 'tools.roster.title',
      descriptionKey: 'tools.roster.description',
      icon: Users,
      color: 'indigo',
      iconBg: 'bg-indigo-500/15 group-hover:bg-indigo-500/25',
      iconColor: 'text-indigo-400',
      hoverBorder: 'group-hover:border-indigo-500/30',
      hoverGlow: 'group-hover:shadow-indigo-500/10',
    },
    {
      href: '/events',
      titleKey: 'tools.events.title',
      descriptionKey: 'tools.events.description',
      icon: Trophy,
      color: 'amber',
      iconBg: 'bg-amber-500/15 group-hover:bg-amber-500/25',
      iconColor: 'text-amber-400',
      hoverBorder: 'group-hover:border-amber-500/30',
      hoverGlow: 'group-hover:shadow-amber-500/10',
    },
    {
      href: '/aoo-strategy',
      titleKey: 'tools.aoo.title',
      descriptionKey: 'tools.aoo.description',
      icon: Swords,
      color: 'emerald',
      iconBg: 'bg-emerald-500/15 group-hover:bg-emerald-500/25',
      iconColor: 'text-emerald-400',
      hoverBorder: 'group-hover:border-emerald-500/30',
      hoverGlow: 'group-hover:shadow-emerald-500/10',
    },
  ];

  return (
    <AppSidebar>
      <div className="min-h-screen">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.03] via-transparent to-transparent pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 py-20">
          {/* Hero - bold and confident */}
          <section className="mb-16">
            <p className="text-sm font-semibold text-indigo-400 mb-4 tracking-wider uppercase">
              {t('tagline')}
            </p>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight leading-[1.1]">
              <span className="bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent">
                {t('title')}
              </span>
            </h1>
            <p className="text-xl text-slate-400 leading-relaxed max-w-2xl">
              {t('subtitle')}
            </p>
          </section>

          {/* Tools Grid - 2x2 layout */}
          <section className="mb-14">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-5 flex items-center gap-3">
              {t('sections.interactiveTools')}
              <span className="h-px flex-1 bg-gradient-to-r from-slate-700 to-transparent" />
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.href} href={tool.href}>
                    <div className={`group relative p-6 rounded-2xl bg-slate-900/50 border border-slate-800/50 ${tool.hoverBorder} hover:bg-slate-800/30 hover:-translate-y-0.5 hover:shadow-xl ${tool.hoverGlow} transition-all duration-300 cursor-pointer overflow-hidden`}>
                      {/* Subtle gradient overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      <div className="relative flex items-start gap-4">
                        {/* Icon */}
                        <div className={`p-3 rounded-xl ${tool.iconBg} transition-colors duration-300 flex-shrink-0`}>
                          <Icon className={`w-6 h-6 ${tool.iconColor}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <h3 className="text-lg font-semibold text-white mb-1.5 group-hover:text-white transition-colors">
                            {t(tool.titleKey)}
                          </h3>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            {t(tool.descriptionKey)}
                          </p>
                        </div>

                        {/* Arrow */}
                        <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Secondary sections in a row */}
          <section className="mb-14">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-5 flex items-center gap-3">
              {t('sections.guides')}
              <span className="h-px flex-1 bg-gradient-to-r from-slate-700 to-transparent" />
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Guide */}
              <Link href="/guide">
                <div className="group relative p-6 rounded-2xl bg-slate-900/50 border border-slate-800/50 group-hover:border-violet-500/30 hover:bg-slate-800/30 hover:-translate-y-0.5 hover:shadow-xl group-hover:shadow-violet-500/10 transition-all duration-300 cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-violet-500/15 group-hover:bg-violet-500/25 transition-colors duration-300 flex-shrink-0">
                      <BookOpen className="w-6 h-6 text-violet-400" />
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <h3 className="text-lg font-semibold text-white mb-1.5">
                        {t('guide.title')}
                      </h3>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        {t('guide.description')}
                      </p>
                    </div>

                    <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 mt-1" />
                  </div>
                </div>
              </Link>

              {/* Beta Tools */}
              <Link href="/beta-tools">
                <div className="group relative p-6 rounded-2xl bg-slate-900/50 border border-slate-800/50 group-hover:border-amber-500/30 hover:bg-slate-800/30 hover:-translate-y-0.5 hover:shadow-xl group-hover:shadow-amber-500/10 transition-all duration-300 cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-amber-500/15 group-hover:bg-amber-500/25 transition-colors duration-300 flex-shrink-0">
                      <FlaskConical className="w-6 h-6 text-amber-400" />
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-lg font-semibold text-white">
                          {t('beta.title')}
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 uppercase tracking-wider">
                          WIP
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        {t('beta.description')}
                      </p>
                    </div>

                    <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 mt-1" />
                  </div>
                </div>
              </Link>
            </div>
          </section>

          {/* Footer - minimal */}
          <footer className="pt-8 border-t border-slate-800/50">
            <div className="flex items-center justify-center gap-6 text-sm">
              <a
                href="https://github.com/avweigel/rok-suite"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-2"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
              <span className="text-slate-700">·</span>
              <a
                href="https://avweigel.github.io/rok-suite/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Docs
              </a>
              <span className="text-slate-700">·</span>
              <span className="text-slate-600">
                {t('footer.copyright')}
              </span>
            </div>
          </footer>
        </div>
      </div>
    </AppSidebar>
  );
}
