import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import JsonLd from "../../components/JsonLd";
import ReadMoreLinks from "@/components/ReadMoreLinks";
import HeroDemoPlayer from "@/components/HeroDemoPlayer";
import { categoryVisuals, HERO_REEL, type AlternativeMedia } from "@/data/alternativesVisuals";
import { breadcrumbSchema, itemListSchema } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import { ALTERNATIVES_CATEGORY_ORDER, ALTERNATIVES_INTRO, competitors } from "@/data/competitorEntries";

const TITLE = "Compare NodeTool with Other AI Creative Tools | NodeTool";
const DESCRIPTION =
  "Side-by-side comparisons of NodeTool with ComfyUI, Runway, Higgsfield, Krea, n8n, Unity, Godot, and other AI tools for video, images, workflows, agents, and games.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/alternatives" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://nodetool.ai/alternatives", siteName: "NodeTool", type: "website", images: DEFAULT_OG_IMAGES },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

function categoryId(category: string): string {
  return `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function groupedCompetitors() {
  const groups = new Map<string, typeof competitors>();
  for (const c of competitors) {
    groups.set(c.category, [...(groups.get(c.category) ?? []), c]);
  }
  const rank = (category: string) => {
    const index = ALTERNATIVES_CATEGORY_ORDER.indexOf(category);
    return index === -1 ? ALTERNATIVES_CATEGORY_ORDER.length : index;
  };
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
}

/**
 * Which of a category's three stages pictures it on the hub. Categories that
 * share a stage set each take a different stage where they can.
 */
const HUB_STAGE: Record<string, 0 | 1 | 2> = {
  "Node editor": 0,
  "AI filmmaking": 1,
  "Video studio": 2,
  "Creative canvas": 1,
  "Workflow automation": 0,
  "Chatbot & agent builder": 2,
  "Agent automation": 1,
};

/** A still for the hub: the image itself, or a clip's poster. */
function still(media: AlternativeMedia): { src: string; alt: string } {
  return media.kind === "image" ? { src: media.src, alt: media.alt } : { src: `${media.base}-poster.webp`, alt: media.alt };
}

const READ_MORE = [
  { label: "Why NodeTool, in the docs", href: "https://docs.nodetool.ai/comparisons" },
  { label: "Node-based workflows", href: "/node-based-workflows" },
  { label: "Pricing", href: "/pricing" },
  { label: "Download NodeTool", href: "/download" },
];

export default function AlternativesIndexPage() {
  const groups = groupedCompetitors();
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-36 lg:px-8">
          <header className="max-w-3xl">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">Compare NodeTool with other AI tools</h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-300">
              {ALTERNATIVES_INTRO}
            </p>
          </header>

          <nav aria-label="Comparison categories" className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {groups.map(([category, items]) => (
                <li key={category}>
                  <a href={`#${categoryId(category)}`} className="focus-ring inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
                    {category}
                    <span className="text-xs text-slate-400">{items.length}</span>
                  </a>
                </li>
              ))}
              <li>
                <a href="#games-compare-title" className="focus-ring inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">Game engines</a>
              </li>
            </ul>
          </nav>

          <div className="mt-12 max-w-5xl rounded-2xl border border-slate-800/70 bg-slate-900/40 p-2 shadow-2xl ring-1 ring-white/5">
            <HeroDemoPlayer mediaBase={HERO_REEL.base} alt={HERO_REEL.alt} caption={HERO_REEL.caption} />
          </div>

          {groups.map(([category, items]) => {
            const visuals = categoryVisuals(category);
            const picture = still(visuals.stages[HUB_STAGE[category] ?? 0].media);
            return (
              <section key={category} aria-labelledby={categoryId(category)} className="mt-20 grid gap-8 border-t border-slate-800 pt-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
                <div className="min-w-0">
                  <h2 id={categoryId(category)} className="text-2xl font-semibold tracking-tight">{category}</h2>
                  <p className="mt-2 text-lg text-slate-200">{visuals.headline}</p>
                  <p className="mt-2 leading-relaxed text-slate-400">{visuals.subline}</p>
                  <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={picture.src} alt={picture.alt} loading="lazy" decoding="async" className="no-desaturate aspect-video h-auto w-full object-cover object-left-top" />
                  </div>
                </div>
                <ul className="grid content-start gap-3 sm:grid-cols-2">
                  {items.map((c) => (
                    <li key={c.slug}>
                      <a href={`/alternatives/${c.slug}`} className="focus-ring group block h-full rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-slate-600">
                        <span className="inline-flex items-center gap-1 font-medium text-cyan-200 group-hover:text-cyan-100">NodeTool vs {c.name}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
                        <span className="mt-1 block text-sm leading-relaxed text-slate-400">{c.competitorTagline.charAt(0).toUpperCase() + c.competitorTagline.slice(1)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <section aria-labelledby="games-compare-title" className="mt-20 grid gap-8 border-t border-slate-800 pt-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
            <div className="min-w-0">
              <h2 id="games-compare-title" className="text-2xl font-semibold tracking-tight">Game engines</h2>
              <p className="mt-2 leading-relaxed text-slate-400">NodeTool, Unity, Godot, Roblox Studio, Summer Engine, and Rosebud compared for games an AI agent builds.</p>
              <a href="/gamedev/ai-game-engines" className="focus-ring mt-4 inline-flex items-center gap-1 rounded font-medium text-cyan-200 hover:text-cyan-100">AI game engines compared<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            </div>
            <a href="/gamedev/ai-game-engines" className="focus-ring block overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/surface-game-poster.webp" alt="A game scene open in NodeTool's game editor" loading="lazy" decoding="async" className="no-desaturate aspect-video h-auto w-full object-cover" />
            </a>
          </section>

          <ReadMoreLinks id="alternatives-links" links={READ_MORE} />
        </div>
        <JsonLd data={breadcrumbSchema([{ name: "Comparisons", url: "/alternatives" }])} />
        <JsonLd
          data={itemListSchema("NodeTool comparisons", [
            { name: "AI game engines compared", url: "/gamedev/ai-game-engines" },
            ...competitors.map((c) => ({ name: `NodeTool vs ${c.name}`, url: `/alternatives/${c.slug}` })),
          ])}
        />
      </main>
      <SiteFooter />
    </>
  );
}
