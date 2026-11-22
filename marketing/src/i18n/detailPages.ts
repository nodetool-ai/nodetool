/**
 * Translated storyboard, ad concept and recipe entries, and the fixed words
 * their pages use, by locale. See i18n/details.ts for how a translation is
 * laid over the English entry.
 */
import type { Storyboard } from "@/data/storyboards";
import type { AdRecipe } from "@/data/adLibrary";
import type { RecipeEntry } from "@/data/recipes";
import {
  EN_AD_LABELS,
  EN_RECIPE_LABELS,
  EN_STORYBOARD_LABELS,
  type AdLabels,
  type RecipeLabels,
  type StoryboardLabels,
} from "./detailLabels";
import { localize, type AdText, type RecipeText, type StoryboardText } from "./details";
import type { Locale } from "./routes";
import zhStoryboards from "./zh/details/storyboards.json";
import zhAdLibrary from "./zh/details/adLibrary.json";
import zhRecipes from "./zh/details/recipes.json";
import { ZH_AD_LABELS, ZH_RECIPE_LABELS, ZH_STORYBOARD_LABELS } from "./zh/detailLabels";

type DetailText = {
  storyboards: Record<string, StoryboardText>;
  adLibrary: Record<string, AdText>;
  recipes: Record<string, RecipeText>;
};

/** Locales with translated detail pages; see TRANSLATED_DETAIL_SECTIONS. */
export const DETAIL_TEXT: Partial<Record<Locale, DetailText>> & { zh: DetailText } = {
  zh: {
    storyboards: zhStoryboards as Record<string, StoryboardText>,
    adLibrary: zhAdLibrary as unknown as Record<string, AdText>,
    recipes: zhRecipes as unknown as Record<string, RecipeText>,
  },
};

type Labels = { storyboard: StoryboardLabels; ad: AdLabels; recipe: RecipeLabels };

const LABELS: Partial<Record<Locale, Labels>> = {
  zh: { storyboard: ZH_STORYBOARD_LABELS, ad: ZH_AD_LABELS, recipe: ZH_RECIPE_LABELS },
};

function labels(locale: Locale): Labels {
  const found = LABELS[locale];
  if (!found) throw new Error(`No ${locale} detail page labels`);
  return found;
}

function text(locale: Locale): DetailText {
  const found = DETAIL_TEXT[locale];
  if (!found) throw new Error(`No ${locale} detail page translations`);
  return found;
}

/** Locales whose detail pages are translated, for the sitemap. */
export const DETAIL_LOCALES = Object.keys(DETAIL_TEXT) as Locale[];

export function storyboardLabels(locale: Locale | null): StoryboardLabels {
  return locale ? labels(locale).storyboard : EN_STORYBOARD_LABELS;
}

export function adLabels(locale: Locale | null): AdLabels {
  return locale ? labels(locale).ad : EN_AD_LABELS;
}

export function recipeLabels(locale: Locale | null): RecipeLabels {
  return locale ? labels(locale).recipe : EN_RECIPE_LABELS;
}

export function localizedStoryboard(locale: Locale | null, board: Storyboard): Storyboard {
  return locale ? localize(board, text(locale).storyboards[board.slug]) : board;
}

export function localizedAd(locale: Locale | null, ad: AdRecipe): AdRecipe {
  return locale ? localize(ad, text(locale).adLibrary[ad.slug]) : ad;
}

export function localizedRecipe(locale: Locale | null, recipe: RecipeEntry): RecipeEntry {
  return locale ? localize(recipe, text(locale).recipes[recipe.slug]) : recipe;
}
