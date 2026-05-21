'use client';

import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LeaderApplicationForm } from '@/components/apply/LeaderApplicationForm';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function ApplyPage() {
  const t = useTranslations('apply');

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/90 backdrop-blur border-b border-[var(--border)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('back')}</span>
          </Link>
          <LanguageSwitcher dropdownDown />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Hero */}
        <section className="mb-6 sm:mb-8 text-center">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-[#4318ff] to-[#9f7aea] shadow-lg shadow-[#4318ff]/25 mb-4">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--foreground)] tracking-tight mb-2">
            {t('title')}
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto">
            {t('subtitle')}
          </p>
        </section>

        <LeaderApplicationForm />

        <footer className="mt-10 pt-6 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--text-muted)]">{t('footer')}</p>
        </footer>
      </main>
    </div>
  );
}
