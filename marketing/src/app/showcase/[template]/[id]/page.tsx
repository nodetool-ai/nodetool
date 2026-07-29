import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import {
  showcaseEntries,
  entryByTemplateAndId,
  relatedEntries,
  humanize,
} from "@/data/showcase";
import type { ShowcaseEntry } from "@/data/showcase";
import { ShowcaseMedia, ShowcaseCard, MetaChip, remixUrl } from "../../_components";

const BASE_URL = "https://nodetool.ai";

export function generateStaticParams() {
  return showcaseEntries.map((e) => ({ template: e.template, id: e.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ template: string; id: string }>;
}): Promise<Metadata> {
  const { template, id } = await params;
  const entry = entryByTemplateAndId(template, id);
  if (!entry) return {};

  // Near-duplicates carry `canonicalOf` (set at ingest): canonical points at the
  // kept entry and the page is excluded from the index.
  const canonicalRoute = entry.canonicalOf ?? entry.route;
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: canonicalRoute },
    robots: entry.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: entry.title,
      description: entry.description,
      url: `${BASE_URL}${entry.route}`,
      type: "article",
      images: entry.mediaType === "image" ? [{ url: entry.src }] : undefined,
    },
  };
}

function mediaJsonLd(entry: ShowcaseEntry) {
  const shared = {
    "@context": "https://schema.org",
    name: entry.prompt.slice(0, 100),
    description: entry.description,
    contentUrl: entry.src.startsWith("http") ? entry.src : `${BASE_URL}${entry.src}`,
    creditText: `Generated with ${entry.modelSlug} on NodeTool`,
    isBasedOn: `${BASE_URL}${entry.canonicalOf ?? entry.route}`,
  };
  if (entry.mediaType === "video") {
    return { ...shared, "@type": "VideoObject", thumbnailUrl: shared.contentUrl };
  }
  return {
    ...shared,
    "@type": "ImageObject",
    width: entry.width ?? undefined,
    height: entry.height ?? undefined,
  };
}

export default async function ShowcaseDetailPage({
  params,
}: {
  params: Promise<{ template: string; id: string }>;
}) {
  const { template, id } = await params;
  const entry = entryByTemplateAndId(template, id);
  if (!entry) notFound();

  const related = relatedEntries(entry);
  const workflowLabel = humanize(entry.template);

  const relatedList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Related generations",
    numberOfItems: related.length,
    itemListElement: related.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}${e.route}`,
      name: e.prompt,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={mediaJsonLd(entry)} />
      <JsonLd data={relatedList} />
      <SiteHeader />

      <div className="relative isolate pt-24 sm:pt-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Link href="/showcase" className="text-blue-300 hover:text-blue-200">
              Showcase
            </Link>
            <span>/</span>
            <Link
              href={`/showcase/workflow/${entry.template}`}
              className="text-blue-300 hover:text-blue-200"
            >
              {workflowLabel}
            </Link>
          </div>

          {/* Hero asset */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950 ring-1 ring-white/5">
            <ShowcaseMedia
              entry={entry}
              priority
              className="mx-auto max-h-[70vh] w-full object-contain"
            />
          </div>

          {/* Prompt as H1 */}
          <h1 className="mt-8 text-2xl font-bold leading-snug tracking-tight text-white md:text-3xl">
            {entry.prompt}
          </h1>

          {/* Model / workflow / provider chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            <MetaChip label="Model" value={entry.modelSlug} />
            <MetaChip label="Workflow" value={workflowLabel} />
            <MetaChip label="Provider" value={entry.provider} />
          </div>

          {/* Params / details */}
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-slate-800/70 bg-slate-900/40 p-6 sm:grid-cols-3">
            <Param label="Model id" value={entry.model} />
            <Param label="Media" value={entry.mediaType} />
            <Param
              label="Dimensions"
              value={
                entry.width && entry.height
                  ? `${entry.width}×${entry.height}`
                  : "—"
              }
            />
            <Param label="Category" value={humanize(entry.category)} />
            <Param label="Batch" value={entry.batch} />
          </dl>

          {/* Remix CTA */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={remixUrl(entry)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
            >
              Remix this in NodeTool
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <span className="text-sm text-slate-400">
              Opens the {workflowLabel} workflow in the app.
            </span>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mx-auto mt-16 max-w-6xl px-6 pb-24">
            <h2 className="text-xl font-semibold tracking-tight text-white">
              More like this
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((e) => (
                <ShowcaseCard key={e.id} entry={e} />
              ))}
            </div>
          </section>
        )}
      </div>

      <SiteFooter />
    </main>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words text-sm text-slate-200">{value}</dd>
    </div>
  );
}
