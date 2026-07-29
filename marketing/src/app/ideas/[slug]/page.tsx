import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import { ideaCategories, getIdeaCategory } from "@/data/ideasEntries";

const BASE_URL = "https://nodetool.ai";

/**
 * Map a template slug to a route that exists on the site today, so idea cards
 * never link to a page PR-2 hasn't shipped yet. Unmapped templates render
 * without a link (the page's download CTA is the shared call to action).
 */
const EXISTING_ROUTE_BY_TEMPLATE: Record<string, string> = {
  "movie-posters": "/use-cases/movie-poster",
  "movie-trailer-generator": "/use-cases/movie-trailer",
  "product-video-generator": "/use-cases/product-video",
};

export function generateStaticParams() {
  return ideaCategories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = getIdeaCategory(slug);
  if (!cat) return {};
  return {
    title: `${cat.label} workflow ideas — NodeTool`,
    description: cat.description,
    alternates: { canonical: cat.route },
    openGraph: {
      title: `${cat.label} workflow ideas — NodeTool`,
      description: cat.description,
      url: `${BASE_URL}${cat.route}`,
      type: "website",
    },
  };
}

export default async function IdeaCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = getIdeaCategory(slug);
  if (!cat) notFound();

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Ideas", item: `${BASE_URL}/ideas` },
      {
        "@type": "ListItem",
        position: 3,
        name: cat.label,
        item: `${BASE_URL}${cat.route}`,
      },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cat.label} workflow ideas`,
    itemListElement: cat.templates.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      description: t.description,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section className="mx-auto max-w-3xl px-6">
          <nav className="text-sm text-slate-400">
            <Link href="/ideas" className="hover:text-slate-200">
              Ideas
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-500">{cat.label}</span>
          </nav>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
            {cat.label} workflow ideas
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            {cat.description}
          </p>
        </section>

        <section
          aria-label={`${cat.label} ideas`}
          className="mx-auto mt-14 max-w-5xl px-6"
        >
          <div className="grid gap-6 sm:grid-cols-2">
            {cat.templates.map((t) => {
              const route = EXISTING_ROUTE_BY_TEMPLATE[t.slug];
              const card = (
                <>
                  <h2 className="text-lg font-semibold text-white">{t.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {t.description}
                  </p>
                  {t.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {t.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-700/70 px-2.5 py-0.5 text-[11px] text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              );
              return route ? (
                <Link
                  key={t.slug}
                  href={route}
                  className="group flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 ring-1 ring-white/5 transition-colors hover:border-blue-500/40"
                >
                  {card}
                  <span className="mt-4 text-xs font-medium text-blue-300">
                    See it in action →
                  </span>
                </Link>
              ) : (
                <div
                  key={t.slug}
                  className="flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 ring-1 ring-white/5"
                >
                  {card}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Build any of these on the canvas
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Every idea here ships as an example workflow. Download Studio and open
            it in one click.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
