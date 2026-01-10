'use client';

import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Swords,
  Sun,
  Calculator,
  Scan,
  ArrowRight,
  ArrowLeft,
  FlaskConical,
} from 'lucide-react';

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
    <div className="min-h-screen bg-[#0f1535]">
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Gradient orbs */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-[#ffb547]/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-[#4318ff]/10 rounded-full blur-[128px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-12 pb-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-[#a0aec0] hover:text-white hover:bg-white/10 transition-all"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffb547] to-[#ffd97a] flex items-center justify-center shadow-lg shadow-[#ffb547]/25">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Beta Tools</h1>
              <p className="text-xs text-[#718096]">Experimental features in development</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        {/* Warning Banner */}
        <div className="mb-8 p-4 rounded-xl bg-[#ffb547]/10 border border-[#ffb547]/30">
          <div className="flex items-start gap-3">
            <FlaskConical className="w-5 h-5 text-[#ffb547] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-[#ffb547] mb-1">Work in Progress</h3>
              <p className="text-sm text-[#a0aec0]">
                These tools are experimental and may have bugs or incomplete features.
                They're shared for testing and feedback purposes.
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
                  <div className={`group relative p-5 rounded-xl bg-[rgba(6,11,40,0.94)] border border-white/10 ${tool.hoverBorder} backdrop-blur-xl transition-all duration-300 cursor-pointer overflow-hidden`}>
                    {/* Hover glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative flex items-center gap-5">
                      {/* Icon */}
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${tool.gradient} shadow-lg ${tool.shadowColor}`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-base font-semibold text-white group-hover:text-white transition-colors">
                            {tool.title}
                          </h4>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#ffb547]/20 text-[#ffb547]">
                            Beta
                          </span>
                        </div>
                        <p className="text-sm text-[#a0aec0]">{tool.description}</p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-5 h-5 text-[#718096] group-hover:text-white group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-[#718096]">
            Angmar Nazgul Guards • Rise of Kingdoms
          </p>
          <p className="text-[10px] text-[#718096]/50 mt-2">
            Have feedback? Let us know on Discord
          </p>
        </footer>
      </div>
    </div>
  );
}
