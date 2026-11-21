import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { storyboards, storyboardsBySlug, STORYBOARD_CATEGORIES } from "@/data/storyboards";
import { adRecipes } from "@/data/adLibrary";
import { recipeEntries } from "@/data/recipes";
import { modelEntries } from "@/data/modelEntries";
import type { CatalogSource } from "@/i18n/content";
import type { Locale } from "@/i18n/routes";
import {
  ZH_AD_LIBRARY,
  ZH_MODALITY,
  ZH_RECIPES,
  ZH_STORYBOARDS,
  ZH_STORYBOARD_CATEGORIES,
  ZH_VENDOR,
} from "@/i18n/zh/catalog";

/*
 * Cards for a generated catalog on a translated page. Titles and lines come
 * from i18n/<locale>/catalog.ts. Each card opens the English detail page,
 * marked with hrefLang, because the detail pages are not translated.
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

function CardGrid({ cards, columns, label }: { cards: Card[]; columns: string; label: string }) {
  return (
    <ul className={`mt-8 grid gap-5 ${columns}`} aria-label={label}>
      {cards.map((card) => (
        <li key={card.key}>
          <a
            href={card.href}
            hrefLang="en"
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

function storyboardCards(slugs?: readonly string[]): Card[] {
  const boards = slugs ? storyboardsBySlug(slugs) : storyboards;
  return boards.map((board) => {
    const zh = ZH_STORYBOARDS[board.slug];
    const category = ZH_STORYBOARD_CATEGORIES[board.category].title;
    return {
      key: board.slug,
      href: board.route,
      title: zh?.title ?? board.title,
      body: zh?.body ?? board.description,
      meta: `${category} · ${board.aspectRatio} · ${board.shots.length} 个镜头`,
      image: { src: board.video.poster.src, alt: zh?.title ?? board.title, aspect: "video" },
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
  // One locale today. A second one adds its catalog module here.
  void locale;

  if (source === "storyboards" && !slugs) {
    return (
      <>
        {STORYBOARD_CATEGORIES.map((category) => {
          const zh = ZH_STORYBOARD_CATEGORIES[category.id];
          const cards = storyboardCards(storyboards.filter((b) => b.category === category.id).map((b) => b.slug));
          return (
            <div key={category.id} className="mt-12">
              <h3 className="text-xl font-semibold text-white">{zh.title}</h3>
              <p className="mt-1 text-slate-400">{zh.body}</p>
              <CardGrid cards={cards} columns="sm:grid-cols-2 lg:grid-cols-3" label={zh.title} />
            </div>
          );
        })}
      </>
    );
  }

  if (source === "storyboards") {
    return <CardGrid cards={storyboardCards(slugs)} columns="sm:grid-cols-2 lg:grid-cols-3" label="故事板" />;
  }

  if (source === "adLibrary") {
    const ads = slugs ? slugs.flatMap((slug) => adRecipes.filter((ad) => ad.slug === slug)) : adRecipes;
    const cards: Card[] = ads.map((ad) => {
      const zh = ZH_AD_LIBRARY[ad.slug];
      const index = adRecipes.indexOf(ad);
      return {
        key: ad.slug,
        href: ad.route,
        title: zh?.title ?? ad.title,
        body: zh?.body ?? ad.objective,
        meta: `${String(index + 1).padStart(2, "0")} · ${Math.round(ad.duration_ms / 1000)} 秒 · ${ad.beats.length} 个节拍`,
        image: ad.video ? { src: ad.video.poster, alt: zh?.title ?? ad.title, aspect: "portrait" } : undefined,
      };
    });
    return <CardGrid cards={cards} columns="grid-cols-2 lg:grid-cols-4" label="广告模板" />;
  }

  if (source === "recipes") {
    const cards: Card[] = recipeEntries.map((recipe) => {
      const zh = ZH_RECIPES[recipe.slug];
      const card = recipe.productionRun?.card;
      return {
        key: recipe.slug,
        href: recipe.route,
        title: zh?.title ?? recipe.name,
        body: zh?.body ?? recipe.outcome,
        meta: "分步教程",
        image: card ? { src: card.src, alt: zh?.title ?? recipe.name, aspect: "video" } : undefined,
      };
    });
    return <CardGrid cards={cards} columns="sm:grid-cols-2 lg:grid-cols-3" label="教程" />;
  }

  const cards: Card[] = modelEntries.map((model) => ({
    key: model.slug,
    href: model.route,
    title: model.name,
    body: `${model.providers.length} 个服务商提供`,
    meta: `${ZH_MODALITY[model.modality]} · ${ZH_VENDOR[model.vendor] ?? model.vendor}`,
  }));
  return <CardGrid cards={cards} columns="grid-cols-2 lg:grid-cols-4" label="模型" />;
}
