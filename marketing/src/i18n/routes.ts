/**
 * Which English routes have a translated version, and the paths between them.
 *
 * A translated route lives at `/<locale><route>`, so `/studio` in Simplified
 * Chinese is `/zh/studio`. The language overview pages (/ja, /zh, …) are a
 * separate set in `data/languagePages.ts` and pair with the home page.
 *
 * Add a translated page: add its English route here, its content in
 * `i18n/<locale>/pages/`, and a route file under `app/<locale>/`.
 * `tests/e2e/localized-pages.spec.ts` checks that the three stay in step.
 */

export type Locale = "zh" | "ja" | "ko";

export const LOCALES: Record<Locale, { hreflang: string; ogLocale: string; label: string }> = {
  zh: { hreflang: "zh-Hans", ogLocale: "zh_CN", label: "简体中文" },
  ja: { hreflang: "ja", ogLocale: "ja_JP", label: "日本語" },
  ko: { hreflang: "ko", ogLocale: "ko_KR", label: "한국어" },
};

/** The language switch label of each locale, in its own script. */
export const SWITCH_LABELS: Record<Locale, string> = { zh: "中文", ja: "日本語", ko: "한국어" };

const KEY_PAGES = [
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
  ] as const;

/** English routes with a translated page, per locale, in nav order. */
export const TRANSLATED_ROUTES: Record<Locale, readonly string[]> = {
  zh: KEY_PAGES,
  ja: KEY_PAGES,
  ko: KEY_PAGES,
};

/**
 * Catalog sections whose detail pages are translated, per locale:
 * `/storyboards/<slug>` → `/zh/storyboards/<slug>`. Every slug in a listed
 * section has a translation (i18n/details.ts), which the spec checks, so a
 * route needs no slug list here and the header stays free of catalog data.
 */
export const TRANSLATED_DETAIL_SECTIONS: Record<Locale, readonly string[]> = {
  zh: ["/storyboards", "/recipes", "/ad-library"],
  ja: ["/storyboards", "/recipes", "/ad-library"],
  ko: [],
};

const LOCALE_LIST = Object.keys(LOCALES) as Locale[];

function isTranslatedDetail(locale: Locale, route: string): boolean {
  return TRANSLATED_DETAIL_SECTIONS[locale].some((section) =>
    new RegExp(`^${section}/[a-z0-9-]+$`).test(route)
  );
}

export function hasTranslation(locale: Locale, route: string): boolean {
  return TRANSLATED_ROUTES[locale].includes(route) || isTranslatedDetail(locale, route);
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
