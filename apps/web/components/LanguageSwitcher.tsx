'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe } from 'lucide-react';
import { useLocale } from 'next-intl';
import { locales, localeNames, getBaseDomain, type Locale } from '@/lib/i18n/config';

interface LanguageSwitcherProps {
  collapsed?: boolean;
}

export function LanguageSwitcher({ collapsed = false }: LanguageSwitcherProps) {
  const currentLocale = useLocale() as Locale;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const switchLocale = (locale: Locale) => {
    if (locale === currentLocale) {
      setIsOpen(false);
      return;
    }

    // Store preference in cookie
    document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;

    // Navigate to subdomain if in production
    const hostname = window.location.hostname;
    const baseDomain = getBaseDomain(hostname);

    if (baseDomain !== hostname || hostname === 'localhost') {
      // We're on a subdomain-capable domain or localhost
      // For localhost, just reload with cookie
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        window.location.reload();
        return;
      }
      const newHost = `${locale}.${baseDomain}`;
      const port = window.location.port ? `:${window.location.port}` : '';
      window.location.href = `${window.location.protocol}//${newHost}${port}${window.location.pathname}${window.location.search}`;
    } else {
      // Single domain, just use cookie and reload
      window.location.reload();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors"
        title={localeNames[currentLocale]}
      >
        <Globe className="w-4 h-4" />
        {!collapsed && (
          <span className="text-xs font-medium">{localeNames[currentLocale]}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-lg overflow-hidden z-[60]">
          <div className="max-h-80 overflow-y-auto py-1">
            {locales.map((locale) => (
              <button
                key={locale}
                onClick={() => {
                  switchLocale(locale);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  locale === currentLocale
                    ? 'bg-[#4318ff]/10 text-[#4318ff] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {localeNames[locale]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
