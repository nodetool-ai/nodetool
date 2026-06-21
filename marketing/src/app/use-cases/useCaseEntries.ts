// Single source of truth for the use-case pages. The main-page showcase maps
// over this list to render teasers; each entry has a matching detail page at
// /use-cases/<slug>. Add an entry here and build its page folder to grow the set.

export type UseCaseAccent = "sky" | "rose" | "emerald" | "amber" | "violet";

export type UseCaseEntry = {
  slug: string;
  title: string;
  category: string;
  teaser: string;
  /** Short pipeline summary, shown as chips on the teaser card. */
  pipeline: string[];
  /** Looping preview clip for the teaser (muted, autoplay). */
  video?: string;
  /** Poster / fallback image for the teaser. */
  poster: string;
  accent: UseCaseAccent;
};

export const useCaseEntries: UseCaseEntry[] = [
  {
    slug: "ai-product-launch-video",
    title: "AI Product Launch Video Generator",
    category: "Marketing",
    teaser:
      "Turn a campaign brief and a single product photo into a cinematic 16:9 launch video. Your inputs feed a prompt, an agent directs the shot, and a text-to-video model renders it.",
    pipeline: ["Brief", "Prompt", "Agent", "Text-to-Video"],
    video: "/product_video_example.mp4",
    poster: "/smartwatch.png",
    accent: "sky",
  },
];

export function getUseCase(slug: string): UseCaseEntry | undefined {
  return useCaseEntries.find((entry) => entry.slug === slug);
}
