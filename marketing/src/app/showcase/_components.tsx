import Link from "next/link";
import type { ShowcaseEntry } from "@/data/showcase";
import { humanize } from "@/data/showcase";

/** Deep link that opens the source workflow in the NodeTool app to remix a shot.
 *
 * The app can't pre-fill the generating prompt from a URL yet (product gap,
 * tracked with PR-3), so we link the workflow and pass the prompt as a hint
 * param for when it can. */
export function remixUrl(entry: ShowcaseEntry): string {
  const params = new URLSearchParams({ prompt: entry.prompt });
  return `https://app.nodetool.ai/templates/${entry.template}?${params.toString()}`;
}

/** Render an entry's asset — <img> for images, <video> for video. */
export function ShowcaseMedia({
  entry,
  className,
  priority,
}: {
  entry: ShowcaseEntry;
  className?: string;
  priority?: boolean;
}) {
  if (entry.mediaType === "video") {
    return (
      <video
        className={className}
        src={entry.src}
        controls
        playsInline
        preload={priority ? "auto" : "metadata"}
        aria-label={entry.prompt}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic showcase src, images are unoptimized
    <img
      className={className}
      src={entry.src}
      alt={entry.prompt}
      width={entry.width ?? undefined}
      height={entry.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
    />
  );
}

/** A linked thumbnail card used in the hub, filter pages, and related grids. */
export function ShowcaseCard({ entry }: { entry: ShowcaseEntry }) {
  return (
    <Link
      href={entry.route}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/50 ring-1 ring-white/5 transition-colors hover:border-blue-500/50"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-slate-950">
        <ShowcaseMedia
          entry={entry}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm text-slate-200">{entry.prompt}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300">
            {entry.modelSlug}
          </span>
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            {humanize(entry.template)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ShowcaseGrid({ entries }: { entries: ShowcaseEntry[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map((e) => (
        <ShowcaseCard key={e.id} entry={e} />
      ))}
    </div>
  );
}

/** Small labelled chip used for model / workflow / provider on the detail page. */
export function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-200">{value}</span>
    </span>
  );
}
