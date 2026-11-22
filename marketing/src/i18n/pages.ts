/**
 * Lookup of translated page content and frame strings by locale.
 */
import type { LocaleChrome, LocalizedPageContent } from "./content";
import type { DownloadPanelCopy } from "@/components/DownloadPanel";
import type { Locale } from "./routes";
import { ZH_PAGES } from "./zh";
import { ZH_CHROME, ZH_DOWNLOAD_PANEL } from "./zh/chrome";
import { JA_PAGES } from "./ja";
import { JA_CHROME, JA_DOWNLOAD_PANEL } from "./ja/chrome";
import { KO_PAGES } from "./ko";
import { KO_CHROME, KO_DOWNLOAD_PANEL } from "./ko/chrome";

const PAGES: Record<Locale, Record<string, LocalizedPageContent>> = { zh: ZH_PAGES, ja: JA_PAGES, ko: KO_PAGES };

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
  return { zh: ZH_CHROME, ja: JA_CHROME, ko: KO_CHROME }[locale];
}

export function downloadPanelCopy(locale: Locale): DownloadPanelCopy {
  return { zh: ZH_DOWNLOAD_PANEL, ja: JA_DOWNLOAD_PANEL, ko: KO_DOWNLOAD_PANEL }[locale];
}
