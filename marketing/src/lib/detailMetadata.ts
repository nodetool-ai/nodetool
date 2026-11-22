import type { Metadata } from "next";
import type { Storyboard } from "@/data/storyboards";
import type { AdRecipe } from "@/data/adLibrary";
import type { RecipeEntry } from "@/data/recipes";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import { fmt } from "@/i18n/detailLabels";
import {
  adLabels,
  localizedAd,
  localizedRecipe,
  localizedStoryboard,
  recipeLabels,
  storyboardLabels,
} from "@/i18n/detailPages";
import { LOCALES, languageAlternates, type Locale } from "@/i18n/routes";

/*
 * Metadata of a storyboard, ad concept or recipe page in English (locale
 * null) or a translation. Both list the other through hreflang.
 */

const BASE_URL = "https://nodetool.ai";

function urls(locale: Locale | null, route: string) {
  const path = locale ? `/${locale}${route}` : route;
  return {
    url: `${BASE_URL}${path}`,
    languages: languageAlternates(route),
    ...(locale ? { locale: LOCALES[locale].ogLocale, alternateLocale: ["en_US"] } : {}),
  };
}

export function storyboardMetadata(locale: Locale | null, english: Storyboard): Metadata {
  const board = localizedStoryboard(locale, english);
  const title = fmt(storyboardLabels(locale).metaTitle, { title: board.title });
  const { url, languages, ...og } = urls(locale, board.route);
  return {
    title: locale ? { absolute: title } : title,
    description: board.description,
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description: board.description,
      url,
      type: "video.other",
      images: [`${BASE_URL}${board.video.poster.src}`],
      ...og,
    },
  };
}

export function adMetadata(locale: Locale | null, english: AdRecipe): Metadata {
  const ad = localizedAd(locale, english);
  const title = fmt(adLabels(locale).metaTitle, { title: ad.title });
  const { url, languages, ...og } = urls(locale, ad.route);
  return {
    title: locale ? { absolute: title } : title,
    description: ad.objective,
    alternates: { canonical: url, languages },
    openGraph: {
      images: DEFAULT_OG_IMAGES,
      title: ad.title,
      description: ad.objective,
      url,
      type: "article",
      ...og,
    },
  };
}

/**
 * The English recipe page keeps its catalog title and description and its own
 * opengraph-image route. A translation titles itself with the recipe's name.
 */
export function recipeMetadata(locale: Locale | null, english: RecipeEntry): Metadata {
  const { url, languages, ...og } = urls(locale, english.route);
  if (!locale) {
    return {
      title: english.title,
      description: english.description,
      alternates: { canonical: url, languages },
      openGraph: { title: english.title, description: english.description, url, type: "article" },
    };
  }
  const recipe = localizedRecipe(locale, english);
  const title = `${recipe.name} | ${recipeLabels(locale).kicker}`;
  const image = english.productionRun?.ogImage;
  return {
    title: { absolute: title },
    description: recipe.outcome,
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description: recipe.outcome,
      url,
      type: "article",
      images: image ? [`${BASE_URL}${image}`] : DEFAULT_OG_IMAGES,
      ...og,
    },
  };
}
