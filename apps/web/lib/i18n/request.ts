import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { getLocaleFromHostname, defaultLocale, type Locale, locales } from './config';

export default getRequestConfig(async () => {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  // 1. Check subdomain
  let locale: Locale = getLocaleFromHostname(host);

  // 2. Fall back to cookie override (for users who manually selected a language without subdomain)
  if (locale === defaultLocale) {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('locale')?.value;
    if (cookieLocale && (locales as readonly string[]).includes(cookieLocale)) {
      locale = cookieLocale as Locale;
    }
  }

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
