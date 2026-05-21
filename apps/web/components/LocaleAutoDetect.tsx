'use client';

import { useEffect } from 'react';
import { locales, type Locale } from '@/lib/i18n/config';

const COOKIE_NAME = 'locale';
const DETECTED_COOKIE = 'locale_detected';

function hasCookie(name: string): boolean {
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(`${name}=`));
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/;max-age=${60 * 60 * 24 * 365}`;
}

/**
 * On first visit (no `locale` cookie and no `locale_detected` marker),
 * pick a supported locale from the browser's language list, set the cookie,
 * and reload so next-intl picks it up server-side. Runs once per browser.
 */
export function LocaleAutoDetect() {
  useEffect(() => {
    if (hasCookie(COOKIE_NAME) || hasCookie(DETECTED_COOKIE)) return;

    const candidates: string[] = [];
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
      if (navigator.language) candidates.push(navigator.language);
    }

    const supported = locales as readonly string[];
    const match = candidates
      .map((tag) => tag.split('-')[0]?.toLowerCase())
      .find((short) => short && supported.includes(short)) as Locale | undefined;

    setCookie(DETECTED_COOKIE, '1');
    if (match && match !== 'en') {
      setCookie(COOKIE_NAME, match);
      window.location.reload();
    }
  }, []);

  return null;
}
