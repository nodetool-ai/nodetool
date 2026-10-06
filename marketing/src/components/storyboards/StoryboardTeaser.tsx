import { ArrowRight } from "lucide-react";
import { storyboards, storyboardsBySlug } from "@/data/storyboards";
import { StoryboardCard } from "./StoryboardCard";

interface StoryboardTeaserProps {
  /** Storyboards to show, in order. */
  readonly slugs: readonly string[];
  readonly kicker?: string;
  readonly heading: string;
  readonly body?: string;
}

/**
 * A row of finished films with their storyboards, for a landing page. Each
 * card opens the storyboard page, which leads with the film.
 */
export default function StoryboardTeaser({
  slugs,
  kicker = "Example storyboards",
  heading,
  body = "Watch the finished film, then see every shot behind it."
}: StoryboardTeaserProps) {
  const boards = storyboardsBySlug(slugs);
  if (boards.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="storyboard-teaser-title"
      className="relative py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-amber-300">{kicker}</p>
            <h2
              id="storyboard-teaser-title"
              className="mt-4 text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl"
            >
              {heading}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              {body}
            </p>
          </div>
          <a
            href="/storyboards"
            className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-amber-300/60 hover:text-amber-200"
          >
            All {storyboards.length} storyboards
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {boards.map((board) => (
            <li key={board.slug}>
              <StoryboardCard board={board} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
