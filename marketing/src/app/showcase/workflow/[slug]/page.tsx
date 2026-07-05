import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { showcaseEntries, showcaseWorkflows, humanize } from "@/data/showcase";
import { ShowcaseGrid } from "../../_components";

const BASE_URL = "https://nodetool.ai";

export function generateStaticParams() {
  return showcaseWorkflows().map((w) => ({ slug: w.slug }));
}

function entriesForWorkflow(slug: string) {
  return showcaseEntries.filter((e) => e.template === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const label = humanize(slug);
  return {
    title: `${label} showcase — AI generations on NodeTool`,
    description: `Every showcase image and video from the ${label} workflow on NodeTool.`,
    alternates: { canonical: `/showcase/workflow/${slug}` },
  };
}

export default async function ShowcaseWorkflowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entries = entriesForWorkflow(slug);
  if (entries.length === 0) notFound();
  const label = humanize(slug);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label} showcase`,
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}${e.route}`,
      name: e.prompt,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={itemList} />
      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section className="mx-auto max-w-6xl px-6">
          <Link href="/showcase" className="text-sm text-blue-300 hover:text-blue-200">
            ← Showcase
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
            {label} showcase
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            {entries.length} generation{entries.length === 1 ? "" : "s"} from the{" "}
            {label} workflow on NodeTool.
          </p>
        </section>

        <section className="mx-auto mt-10 max-w-6xl px-6 pb-24">
          <ShowcaseGrid entries={entries} />
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
