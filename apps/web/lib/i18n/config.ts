export const locales = [
  'en', 'es', 'ko', 'ja', 'vi',
  'ru', 'it', 'fr', 'de', 'pt',
  'zh', 'ar', 'tr', 'th', 'hi',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  ko: '한국어',
  ja: '日本語',
  vi: 'Tiếng Việt',
  ru: 'Русский',
  it: 'Italiano',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  zh: '简体中文',
  ar: 'العربية',
  tr: 'Türkçe',
  th: 'ไทย',
  hi: 'हिन्दी',
};

export const rtlLocales: Locale[] = ['ar'];

export function getLocaleFromHostname(hostname: string): Locale {
  const subdomain = hostname.split('.')[0];
  if ((locales as readonly string[]).includes(subdomain)) {
    return subdomain as Locale;
  }
  return defaultLocale;
}

export function getBaseDomain(hostname: string): string {
  const parts = hostname.split('.');
  // e.g. "en.rok-suite.com" -> "rok-suite.com"
  // e.g. "rok-suite.com" -> "rok-suite.com"
  // e.g. "en.rok-suite.local" -> "rok-suite.local"
  if (parts.length > 2) {
    return parts.slice(1).join('.');
  }
  return hostname;
}

export function detectPreferredLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

  // Parse Accept-Language header: "en-US,en;q=0.9,ko;q=0.8"
  const preferences = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      return { lang: lang.trim().split('-')[0].toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const pref of preferences) {
    if ((locales as readonly string[]).includes(pref.lang)) {
      return pref.lang as Locale;
    }
  }

  return defaultLocale;
}
