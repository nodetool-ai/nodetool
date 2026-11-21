/**
 * Lookup of translated page content and frame strings by locale.
 */
import type { LocaleChrome, LocalizedPageContent } from "./content";
import type { DownloadPanelCopy } from "@/components/DownloadPanel";
import type { Locale } from "./routes";
import { ZH_PAGES } from "./zh";
import { ZH_CHROME, ZH_DOWNLOAD_PANEL } from "./zh/chrome";

const PAGES: Record<Locale, Record<string, LocalizedPageContent>> = { zh: ZH_PAGES };

export function localizedPage(locale: Locale, route: string): LocalizedPageContent {
  const page = PAGES[locale][route];
  if (!page) {
    throw new Error(`No ${locale} translation for ${route}`);
  }
  return page;
}

export function localizedPages(locale: Locale): LocalizedPageContent[] {
  return Object.values(PAGES[locale]);
}

export function localeChrome(locale: Locale): LocaleChrome {
  return { zh: ZH_CHROME }[locale];
}

export function downloadPanelCopy(locale: Locale): DownloadPanelCopy {
  return { zh: ZH_DOWNLOAD_PANEL }[locale];
}
