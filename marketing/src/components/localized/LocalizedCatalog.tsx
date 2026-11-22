import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { storyboards, storyboardsBySlug, STORYBOARD_CATEGORIES } from "@/data/storyboards";
import { adRecipes } from "@/data/adLibrary";
import { recipeEntries } from "@/data/recipes";
import { modelEntries } from "@/data/modelEntries";
import type { CatalogSource } from "@/i18n/content";
import type { Locale } from "@/i18n/routes";
import { localeHref } from "@/i18n/links";
import { fmt } from "@/i18n/detailLabels";
import * as zh from "@/i18n/zh/catalog";
import * as ja from "@/i18n/ja/catalog";
import * as ko from "@/i18n/ko/catalog";
import type { StoryboardCategory } from "@/data/storyboards";
import type { Modality } from "@/data/modelEntries";

type Line = { title: string; body: string };

type Catalog = {
  categories: Record<StoryboardCategory, Line>;
  storyboards: Record<string, Line>;
  ads: Record<string, Line>;
  recipes: Record<string, Line>;
  modality: Record<Modality, string>;
  vendor: Record<string, string>;
  /** Card meta and list labels. `{n}` is a count. */
  words: {
    storyboards: string;
    shots: string;
    seconds: string;
    beats: string;
    ads: string;
    recipe: string;
    recipes: string;
    providers: string;
    models: string;
  };
};

const CATALOGS: Record<Locale, Catalog> = {
  zh: {
    categories: zh.ZH_STORYBOARD_CATEGORIES,
    storyboards: zh.ZH_STORYBOARDS,
    ads: zh.ZH_AD_LIBRARY,
    recipes: zh.ZH_RECIPES,
    modality: zh.ZH_MODALITY,
    vendor: zh.ZH_VENDOR,
    words: {
      storyboards: "故事板",
      shots: "{n} 个镜头",
      seconds: "{n} 秒",
      beats: "{n} 个节拍",
      ads: "广告模板",
      recipe: "分步教程",
      recipes: "教程",
      providers: "{n} 个服务商提供",
      models: "模型",
    },
  },
  ja: {
    categories: ja.JA_STORYBOARD_CATEGORIES,
    storyboards: ja.JA_STORYBOARDS,
    ads: ja.JA_AD_LIBRARY,
    recipes: ja.JA_RECIPES,
    modality: ja.JA_MODALITY,
    vendor: ja.JA_VENDOR,
    words: {
      storyboards: "ストーリーボード",
      shots: "{n}ショット",
      seconds: "{n}秒",
      beats: "{n}ビート",
      ads: "広告テンプレート",
      recipe: "レシピ",
      recipes: "レシピ",
      providers: "{n}社のプロバイダーが提供",
      models: "モデル",
    },
  },
  ko: {
    categories: ko.KO_STORYBOARD_CATEGORIES,
    storyboards: ko.KO_STORYBOARDS,
    ads: ko.KO_AD_LIBRARY,
    recipes: ko.KO_RECIPES,
    modality: ko.KO_MODALITY,
    vendor: ko.KO_VENDOR,
    words: {
      storyboards: "스토리보드",
      shots: "샷 {n}개",
      seconds: "{n}초",
      beats: "비트 {n}개",
      ads: "광고 템플릿",
      recipe: "레시피",
      recipes: "레시피",
      providers: "프로바이더 {n}곳에서 제공",
      models: "모델",
    },
  },
};

/*
 * Cards for a generated catalog on a translated page. Titles and lines come
 * from i18n/<locale>/catalog.ts. A card opens the translated detail page
 * when there is one, else the English page marked with hrefLang.
 */

type Card = {
  key: string;
  href: string;
  title: string;
  body: string;
  meta: string;
  image?: { src: string; alt: string; aspect: "video" | "portrait" | "square" };
};

const aspectClass = { video: "aspect-video", portrait: "aspect-[9/16]", square: "aspect-square" } as const;

function CardGrid({
  locale,
  cards,
  columns,
  label,
}: {
  locale: Locale;
  cards: Card[];
  columns: string;
  label: string;
}) {
  return (
    <ul className={`mt-8 grid gap-5 ${columns}`} aria-label={label}>
      {cards.map((card) => (
        <li key={card.key}>
          <a
            href={localeHref(locale, card.href).href}
            hrefLang={localeHref(locale, card.href).hrefLang}
            className="focus-ring group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/50 transition-colors hover:border-slate-600"
          >
            {card.image && (
              <div className={`relative w-full bg-slate-950 ${aspectClass[card.image.aspect]}`}>
                <Image
                  src={card.image.src}
                  alt={card.image.alt}
                  fill
                  sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            )}
            <span className="flex flex-1 flex-col p-5">
              <span className="text-xs text-slate-400">{card.meta}</span>
              <span className="mt-1 text-lg font-semibold text-white">{card.title}</span>
              <span className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">{card.body}</span>
              <ArrowRight className="mt-3 h-4 w-4 text-slate-400 group-hover:text-white" aria-hidden="true" />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function storyboardCards(catalog: Catalog, slugs?: readonly string[]): Card[] {
  const boards = slugs ? storyboardsBySlug(slugs) : storyboards;
  return boards.map((board) => {
    const line = catalog.storyboards[board.slug];
    const category = catalog.categories[board.category].title;
    return {
      key: board.slug,
      href: board.route,
      title: line?.title ?? board.title,
      body: line?.body ?? board.description,
      meta: `${category} · ${board.aspectRatio} · ${fmt(catalog.words.shots, { n: board.shots.length })}`,
      image: { src: board.video.poster.src, alt: line?.title ?? board.title, aspect: "video" },
    };
  });
}

export default function LocalizedCatalog({
  locale,
  source,
  slugs,
}: {
  locale: Locale;
  source: CatalogSource;
  slugs?: readonly string[];
}) {
  const catalog = CATALOGS[locale];
  const { words } = catalog;

  if (source === "storyboards" && !slugs) {
    return (
      <>
        {STORYBOARD_CATEGORIES.map((category) => {
          const line = catalog.categories[category.id];
          const cards = storyboardCards(
            catalog,
            storyboards.filter((b) => b.category === category.id).map((b) => b.slug)
          );
          return (
            <div key={category.id} className="mt-12">
              <h3 className="text-xl font-semibold text-white">{line.title}</h3>
              <p className="mt-1 text-slate-400">{line.body}</p>
              <CardGrid locale={locale} cards={cards} columns="sm:grid-cols-2 lg:grid-cols-3" label={line.title} />
            </div>
          );
        })}
      </>
    );
  }

  if (source === "storyboards") {
    return <CardGrid
        locale={locale}
        cards={storyboardCards(catalog, slugs)}
        columns="sm:grid-cols-2 lg:grid-cols-3"
        label={words.storyboards}
      />;
  }

  if (source === "adLibrary") {
    const ads = slugs ? slugs.flatMap((slug) => adRecipes.filter((ad) => ad.slug === slug)) : adRecipes;
    const cards: Card[] = ads.map((ad) => {
      const line = catalog.ads[ad.slug];
      const index = adRecipes.indexOf(ad);
      return {
        key: ad.slug,
        href: ad.route,
        title: line?.title ?? ad.title,
        body: line?.body ?? ad.objective,
        meta: `${String(index + 1).padStart(2, "0")} · ${fmt(words.seconds, { n: Math.round(ad.duration_ms / 1000) })} · ${fmt(words.beats, { n: ad.beats.length })}`,
        image: ad.video ? { src: ad.video.poster, alt: line?.title ?? ad.title, aspect: "portrait" } : undefined,
      };
    });
    return <CardGrid locale={locale} cards={cards} columns="grid-cols-2 lg:grid-cols-4" label={words.ads} />;
  }

  if (source === "recipes") {
    const recipes = slugs ? slugs.flatMap((slug) => recipeEntries.filter((recipe) => recipe.slug === slug)) : recipeEntries;
    const cards: Card[] = recipes.map((recipe) => {
      const line = catalog.recipes[recipe.slug];
      const card = recipe.productionRun?.card;
      return {
        key: recipe.slug,
        href: recipe.route,
        title: line?.title ?? recipe.name,
        body: line?.body ?? recipe.outcome,
        meta: words.recipe,
        image: card ? { src: card.src, alt: line?.title ?? recipe.name, aspect: "video" } : undefined,
      };
    });
    return <CardGrid locale={locale} cards={cards} columns="sm:grid-cols-2 lg:grid-cols-3" label={words.recipes} />;
  }

  const cards: Card[] = modelEntries.map((model) => ({
    key: model.slug,
    href: model.route,
    title: model.name,
    body: fmt(words.providers, { n: model.providers.length }),
    meta: `${catalog.modality[model.modality]} · ${catalog.vendor[model.vendor] ?? model.vendor}`,
  }));
  return <CardGrid locale={locale} cards={cards} columns="grid-cols-2 lg:grid-cols-4" label={words.models} />;
}
