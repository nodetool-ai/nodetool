/**
 * Which English routes have a translated version, and the paths between them.
 *
 * A translated route lives at `/<locale><route>`, so `/studio` in Simplified
 * Chinese is `/zh/studio`. The language overview pages (/ja, /zh, …) are a
 * separate set in `data/languagePages.ts` and pair with the home page.
 *
 * Add a translated page: add its English route here, its content in
 * `i18n/<locale>/pages/`, and a route file under `app/<locale>/`.
 * `tests/e2e/zh-pages.spec.ts` checks that the three stay in step.
 */

export type Locale = "zh";

export const LOCALES: Record<Locale, { hreflang: string; ogLocale: string; label: string }> = {
  zh: { hreflang: "zh-Hans", ogLocale: "zh_CN", label: "简体中文" },
};

/** English routes with a translated page, per locale, in nav order. */
export const TRANSLATED_ROUTES: Record<Locale, readonly string[]> = {
  zh: [
    "/studio",
    "/agents",
    "/node-based-workflows",
    "/ai-video-editor",
    "/storyboards",
    "/mcp",
    "/models",
    "/download",
    "/pricing",
    "/marketing",
    "/recipes",
    "/ad-library",
    "/alternatives/comfyui",
  ],
};

const LOCALE_LIST = Object.keys(LOCALES) as Locale[];

export function hasTranslation(locale: Locale, route: string): boolean {
  return TRANSLATED_ROUTES[locale].includes(route);
}

/** `/zh/studio` for a translated route, `/zh` for home, else null. */
export function localizedPath(locale: Locale, route: string): string | null {
  if (route === "/") return `/${locale}`;
  return hasTranslation(locale, route) ? `/${locale}${route}` : null;
}

/** The locale a path is written in, or null for English. */
export function localeOfPath(pathname: string | null): Locale | null {
  if (!pathname) return null;
  return LOCALE_LIST.find((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) ?? null;
}

/** The English route behind a translated path: `/zh/studio` → `/studio`. */
export function englishRoute(pathname: string): string {
  const locale = localeOfPath(pathname);
  if (!locale) return pathname;
  return pathname.slice(locale.length + 1) || "/";
}

/**
 * hreflang alternates for an English route with translations, or undefined
 * when it has none. English is also the x-default.
 */
export function languageAlternates(route: string): Record<string, string> | undefined {
  const translated = LOCALE_LIST.filter((locale) => hasTranslation(locale, route));
  if (translated.length === 0) return undefined;
  return {
    en: route,
    ...Object.fromEntries(translated.map((locale) => [LOCALES[locale].hreflang, `/${locale}${route}`])),
    "x-default": route,
  };
}
