import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import MarketingPageShell from "@/components/MarketingPageShell";
import JsonLd from "@/components/JsonLd";
import StoryboardViewer from "@/components/storyboards/StoryboardViewer";
import { StoryboardCard } from "@/components/storyboards/StoryboardCard";
import {
  categoryLabel,
  getStoryboard,
  isVertical,
  storyboards
} from "@/data/storyboards";
import type { Storyboard } from "@/data/storyboards";

interface StoryboardPageProps {
  readonly params: Promise<{ slug: string }>;
}
export const dynamicParams = false;
export function generateStaticParams() {
  return storyboards.map((board) => ({ slug: board.slug }));
}
export async function generateMetadata({
  params
}: StoryboardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const board = getStoryboard(slug);
  if (!board) {
    return {};
  }
  const title = `${board.title} storyboard | NodeTool`;
  const url = `https://nodetool.ai${board.route}`;
  return {
    title,
    description: board.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: board.description,
      url,
      type: "video.other",
      images: [`https://nodetool.ai${board.video.poster.src}`]
    }
  };
}

function related(board: Storyboard): Storyboard[] {
  const index = storyboards.findIndex((item) => item.slug === board.slug);
  const sameCategory = storyboards.filter(
    (item) => item.category === board.category && item.slug !== board.slug
  );
  const next = [...storyboards.slice(index + 1), ...storyboards.slice(0, index)];
  const picks = sameCategory.slice(0, 3);
  for (const item of next) {
    if (picks.length >= 3) {
      break;
    }
    if (!picks.includes(item)) {
      picks.push(item);
    }
  }
  return picks;
}

function Header({ board }: { board: Storyboard }) {
  const wide = !isVertical(board);
  const facts = [
    { label: "Length", value: `${Math.round(board.video.duration)}s` },
    { label: "Shots", value: String(board.shots.length) },
    { label: "Format", value: board.aspectRatio }
  ];
  return (
    <header
      className={
        wide ? "grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]" : ""
      }
    >
      <div>
        <p className="flex items-center gap-3 text-sm">
          <span className="font-medium text-amber-300">
            {categoryLabel(board.category)}
          </span>
          <span className="font-jetbrains text-slate-500">Storyboard</span>
        </p>
        <h1
          className={`mt-4 font-semibold leading-[1.05] tracking-tight text-white ${
            wide ? "text-4xl md:text-5xl" : "text-4xl md:text-6xl"
          }`}
        >
          {board.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300 md:text-xl">
          {board.description}
        </p>
      </div>
      <dl
        className={`grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 ${
          wide ? "" : "mt-8"
        }`}
      >
        {facts.map((fact) => (
          <div key={fact.label} className="bg-slate-950 px-5 py-4">
            <dt className="text-xs text-slate-400">{fact.label}</dt>
            <dd className="mt-1.5 text-lg font-medium text-white">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

export default async function StoryboardPage({ params }: StoryboardPageProps) {
  const { slug } = await params;
  const board = getStoryboard(slug);
  if (!board) {
    notFound();
  }
  const more = related(board);
  return (
    <MarketingPageShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: board.title,
          description: board.description,
          thumbnailUrl: `https://nodetool.ai${board.video.poster.src}`,
          contentUrl: board.video.src,
          duration: `PT${Math.round(board.video.duration)}S`,
          width: board.video.width,
          height: board.video.height
        }}
      />
      <article className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-8">
        <a
          href="/storyboards"
          className="focus-ring mb-10 inline-flex items-center gap-2 rounded text-sm text-slate-400 hover:text-amber-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All storyboards
        </a>
        <StoryboardViewer board={board}>
          <Header board={board} />
        </StoryboardViewer>
        <section
          aria-label="Brief and style"
          className="mt-24 grid gap-12 border-t border-white/10 pt-16 md:grid-cols-2 md:gap-16"
        >
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              The brief
            </h2>
            <p className="mt-5 leading-relaxed text-slate-300">{board.brief}</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Visual style
            </h2>
            <figure className="mt-5 border-l-2 border-amber-300 pl-6">
              <blockquote className="leading-relaxed text-slate-100">
                {board.style}
              </blockquote>
            </figure>
          </div>
        </section>
        <section
          aria-label="Open in NodeTool"
          className="mt-20 flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:flex-row md:items-center"
        >
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Change a shot, render again
            </h2>
            <p className="mt-2 leading-relaxed text-slate-300">
              This storyboard ships as an example in NodeTool. Open it in the
              Studio, edit the direction for any shot, and render a new take.
            </p>
          </div>
          <a
            href="/download"
            className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-medium text-slate-950 transition-colors hover:bg-amber-300"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download NodeTool
          </a>
        </section>
        <nav
          aria-label="More storyboards"
          className="mt-20 border-t border-white/10 pt-16"
        >
          <div className="mb-10 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              More storyboards
            </h2>
            <a
              href="/storyboards"
              className="focus-ring inline-flex items-center gap-2 rounded text-sm text-slate-300 hover:text-amber-200"
            >
              See all {storyboards.length}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((item) => (
              <li key={item.slug}>
                <StoryboardCard board={item} />
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </MarketingPageShell>
  );
}
