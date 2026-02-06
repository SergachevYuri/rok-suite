'use client';

import Link from 'next/link';
import {
  Sun,
  Calculator,
  Scan,
  ArrowRight,
  FlaskConical,
} from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';

export default function BetaToolsPage() {
  const tools = [
    {
      href: '/scanners',
      title: 'Scanners',
      description: 'Scan screenshots to inventory commanders, equipment, and bag items',
      icon: Scan,
      gradient: 'from-[#4318ff] to-[#9f7aea]',
      shadowColor: 'shadow-[#4318ff]/25',
      hoverBorder: 'hover:border-[#4318ff]/50',
    },
    {
      href: '/sunset-canyon',
      title: 'Sunset Canyon Simulator',
      description: 'Commander scanner, formation optimizer, and battle simulation',
      icon: Sun,
      gradient: 'from-[#ffb547] to-[#ffd97a]',
      shadowColor: 'shadow-[#ffb547]/25',
      hoverBorder: 'hover:border-[#ffb547]/50',
    },
    {
      href: '/upgrade-calculator',
      title: 'Upgrade Calculator',
      description: 'Building dependency graph and resource planning for City Hall upgrades',
      icon: Calculator,
      gradient: 'from-[#0075ff] to-[#21d4fd]',
      shadowColor: 'shadow-[#0075ff]/25',
      hoverBorder: 'hover:border-[#0075ff]/50',
    },
  ];

  return (
    <AppSidebar>
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <header className="flex items-center gap-3 mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-[var(--border)]">
          <div className="p-2.5 rounded-lg bg-orange-500/15">
            <FlaskConical className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Beta Tools</h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">Experimental features</p>
          </div>
        </header>

        {/* Warning Banner */}
        <div className="mb-8 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30">
          <div className="flex items-start gap-3">
            <FlaskConical className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-orange-500 mb-1">Work in Progress</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                These tools are experimental and may have bugs or incomplete features.
                They&apos;re shared for testing and feedback purposes.
              </p>
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        <section>
          <div className="grid gap-4">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.href} href={tool.href}>
                  <div className={`group relative p-5 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] ${tool.hoverBorder} hover:bg-[var(--background-hover)] hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-hover)] transition-all duration-200 cursor-pointer overflow-hidden`}>
                    <div className="relative flex items-center gap-5">
                      {/* Icon */}
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${tool.gradient} shadow-lg ${tool.shadowColor}`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-base font-semibold group-hover:text-orange-500 transition-colors duration-200">
                            {tool.title}
                          </h4>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider bg-orange-500/20 text-orange-500">
                            Beta
                          </span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">{tool.description}</p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-orange-500 group-hover:translate-x-1 transition-all duration-200" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--text-secondary)]">
            Angmar Nazgul Guards • Rise of Kingdoms
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            Have feedback? Let us know on Discord
          </p>
        </footer>
      </div>
    </div>
    </AppSidebar>
  );
}
