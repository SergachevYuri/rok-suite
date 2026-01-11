'use client';

import Link from 'next/link';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
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
} from 'lucide-react';

export default function Home() {
  const tools = [
    {
      href: '/calendar',
      title: 'Alliance Calendar',
      description: 'Upcoming events, KvK schedule, and alliance activities',
      icon: Calendar,
      gradient: 'from-[#f56565] to-[#ed8936]',
      shadowColor: 'shadow-[#f56565]/25',
      hoverBorder: 'hover:border-[#f56565]/50',
      badge: { text: 'Events', color: 'bg-[#f56565]/20 text-[#ed8936]' },
    },
    {
      href: '/roster',
      title: 'Alliance Roster',
      description: 'Member stats, power rankings, and kill points tracking',
      icon: Users,
      gradient: 'from-[#4318ff] to-[#9f7aea]',
      shadowColor: 'shadow-[#4318ff]/25',
      hoverBorder: 'hover:border-[#4318ff]/50',
      badge: { text: 'Members', color: 'bg-[#4318ff]/20 text-[#9f7aea]' },
    },
    {
      href: '/aoo-strategy',
      title: 'AoO Battle Planner',
      description: 'Interactive 30v30 team assignments, drag-drop battle maps, and match planning',
      icon: Swords,
      gradient: 'from-[#01b574] to-[#01b574]',
      shadowColor: 'shadow-[#01b574]/25',
      hoverBorder: 'hover:border-[#01b574]/50',
      badge: { text: 'Tool', color: 'bg-[#01b574]/20 text-[#01b574]' },
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Gradient orbs for visual interest */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-[#4318ff]/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-[#01b574]/10 rounded-full blur-[128px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-16 pb-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4318ff] to-[#9f7aea] flex items-center justify-center shadow-lg shadow-[#4318ff]/25">
              <Swords className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--foreground)]">RoK Suite</h1>
              <p className="text-xs text-[var(--text-muted)]">Angmar Nazgul Guards</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="https://github.com/avweigel/rok-suite"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-lg bg-[var(--background-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-all"
              title="View on GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
            <UserMenu />
          </div>
        </header>

        {/* Hero */}
        <section className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4318ff]/10 border border-[#4318ff]/20 mb-6">
            <Sparkles className="w-4 h-4 text-[#9f7aea]" />
            <span className="text-sm font-medium text-[#9f7aea]">Strategy Tools for RoK</span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-[var(--foreground)] mb-4 tracking-tight">
            Rise of Kingdoms
          </h2>
          <p className="text-xl text-[var(--text-secondary)] mb-2">
            Strategy Tools & Battle Planning
          </p>
          <p className="text-sm text-[#4318ff]">
            Built for Angmar Nazgul Guards
          </p>
        </section>

        {/* Interactive Tools */}
        <section className="mb-16">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-4">
              Interactive Tools
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
          </div>

          <div className="grid gap-4">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.href} href={tool.href}>
                  <div className={`group relative p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] ${tool.hoverBorder} backdrop-blur-xl transition-all duration-300 cursor-pointer overflow-hidden`}>
                    {/* Hover glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative flex items-center gap-5">
                      {/* Icon */}
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${tool.gradient} shadow-lg ${tool.shadowColor}`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-base font-semibold text-[var(--foreground)] transition-colors">
                            {tool.title}
                          </h4>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${tool.badge.color}`}>
                            {tool.badge.text}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">{tool.description}</p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Guides & Documentation */}
        <section className="mb-16">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-4">
              Guides & Documentation
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
          </div>

          <div className="grid gap-4">
            <Link href="/guide">
              <div className="group relative p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[#9f7aea]/50 backdrop-blur-xl transition-all duration-300 cursor-pointer overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative flex items-center gap-5">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-[#9f7aea] to-[#4318ff] shadow-lg shadow-[#9f7aea]/25">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-base font-semibold text-[var(--foreground)]">
                        Strategy Guide
                      </h4>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#9f7aea]/20 text-[#9f7aea]">
                        Docs
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Event strategies, alliance protocols, commander guides, and checklists
                    </p>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Beta Tools */}
        <section className="mb-20">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-4">
              Experimental
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
          </div>

          <div className="grid gap-4">
            <Link href="/beta-tools">
              <div className="group relative p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] hover:border-[#ffb547]/50 backdrop-blur-xl transition-all duration-300 cursor-pointer overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative flex items-center gap-5">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-[#ffb547] to-[#ffd97a] shadow-lg shadow-[#ffb547]/25">
                    <FlaskConical className="w-6 h-6 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-base font-semibold text-[var(--foreground)]">
                        Beta Tools
                      </h4>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#ffb547]/20 text-[#ffb547]">
                        WIP
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Scanners, Sunset Canyon simulator, Upgrade Calculator - experimental features in development
                    </p>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-[var(--border)] text-center">
          <div className="flex items-center justify-center gap-6 mb-4">
            <a
              href="https://github.com/avweigel/rok-suite"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-2"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
            <span className="text-[var(--text-muted)]/30">•</span>
            <a
              href="https://avweigel.github.io/rok-suite/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Documentation
            </a>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Angmar Nazgul Guards • Rise of Kingdoms
          </p>
          <p className="text-[10px] text-[var(--text-muted)]/50 mt-2">
            Built with Claude Code
          </p>
        </footer>
      </div>
    </div>
  );
}
