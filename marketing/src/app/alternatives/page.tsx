import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import JsonLd from "../../components/JsonLd";
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

          <section aria-labelledby="games-compare-title" className="mt-16 max-w-3xl rounded-xl border border-slate-700 p-6">
            <h2 id="games-compare-title" className="text-xl font-semibold">Game engines</h2>
            <p className="mt-2 leading-relaxed text-slate-300">NodeTool, Unity, Godot, Roblox Studio, Summer Engine, and Rosebud compared for games an AI agent builds.</p>
            <a href="/gamedev/ai-game-engines" className="focus-ring mt-4 inline-flex items-center gap-1 rounded font-medium text-cyan-200 hover:text-cyan-100">AI game engines compared<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
          </section>

          {groups.map(([category, items]) => (
            <section key={category} aria-labelledby={categoryId(category)} className="mt-16">
              <h2 id={categoryId(category)} className="text-2xl font-semibold tracking-tight">{category}</h2>
              <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => (
                  <li key={c.slug}>
                    <a href={`/alternatives/${c.slug}`} className="focus-ring inline-flex items-center gap-1 rounded text-lg font-medium text-cyan-200 hover:text-cyan-100">NodeTool vs {c.name}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
                    <p className="mt-1 leading-relaxed text-slate-300">{c.competitorTagline.charAt(0).toUpperCase() + c.competitorTagline.slice(1)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
