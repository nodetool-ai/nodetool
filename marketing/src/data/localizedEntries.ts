import type { PageEntry } from "./types";
import { LOCALES, localizedPath, type Locale } from "@/i18n/routes";
import { localizedPages } from "@/i18n/pages";
import { storyboards } from "@/data/storyboards";
import { adRecipes } from "@/data/adLibrary";
import { recipeEntries } from "@/data/recipes";
import { localizedAd, localizedRecipe, localizedStoryboard } from "@/i18n/detailPages";

const entry = (route: string, title: string, description: string, priority: number): PageEntry => ({
  route,
  title,
  description,
  priority,
  changeFrequency: "monthly" as const,
  indexable: true,
});

/**
 * Translated pages (/zh/studio, /zh/storyboards/<slug>, …) for the sitemap and
 * the smoke suite. Each one sits a step below its English page in priority.
 */
export const localizedEntries: PageEntry[] = (Object.keys(LOCALES) as Locale[]).flatMap((locale) => [
  ...localizedPages(locale).map((page) =>
    entry(localizedPath(locale, page.route) ?? page.route, page.title, page.description, 0.6)
  ),
  ...storyboards.map((english) => {
    const board = localizedStoryboard(locale, english);
    return entry(`/${locale}${board.route}`, board.title, board.description, 0.5);
  }),
  ...recipeEntries.map((english) => {
    const recipe = localizedRecipe(locale, english);
    return entry(`/${locale}${recipe.route}`, recipe.name, recipe.outcome, 0.7);
  }),
  ...adRecipes.map((english) => {
    const ad = localizedAd(locale, english);
    return entry(`/${locale}${ad.route}`, ad.title, ad.objective, 0.5);
  }),
]);
