'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe } from 'lucide-react';
import { useLocale } from 'next-intl';
import { locales, localeNames, type Locale } from '@/lib/i18n/config';

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

    // Store preference in cookie and reload
    document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
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
