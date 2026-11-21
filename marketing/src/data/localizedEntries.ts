import type { PageEntry } from "./types";
import { LOCALES, localizedPath, type Locale } from "@/i18n/routes";
import { localizedPages } from "@/i18n/pages";

/**
 * Translated pages (/zh/studio, …) for the sitemap and the smoke suite. Each
 * one sits a step below its English page in priority.
 */
export const localizedEntries: PageEntry[] = (Object.keys(LOCALES) as Locale[]).flatMap((locale) =>
  localizedPages(locale).map((page) => ({
    route: localizedPath(locale, page.route) ?? page.route,
    title: page.title,
    description: page.description,
    priority: 0.6,
    changeFrequency: "monthly" as const,
    indexable: true,
  }))
);
