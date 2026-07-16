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
  /** Preview clip for the teaser. */
  video?: string;
  /** Poster / fallback image for the teaser. */
  poster: string;
  accent: UseCaseAccent;
};

export const useCaseEntries: UseCaseEntry[] = [
  {
    slug: "movie-trailer",
    title: "Movie Trailer Generator",
    category: "Film",
    teaser:
      "Type one logline and the canvas builds a cinematic teaser. A showrunner agent writes the treatment, a list generator breaks it into shots, each shot is rendered as key art, animated, and cut into a finished trailer.",
    pipeline: ["Logline", "Treatment", "Shots", "Key art", "Trailer"],
    video: "/movie_trailer_example.mp4",
    poster: "/trailer-shot-1.webp",
    accent: "amber",
  },
  {
    slug: "product-video",
    title: "Product Video Generator",
    category: "Marketing",
    teaser:
      "Turn a campaign brief and a single product photo into a cinematic 16:9 product video. Your inputs feed a prompt, an agent directs the shot, and a text-to-video model renders it.",
    pipeline: ["Brief", "Prompt", "Agent", "Text-to-Video"],
    video: "/product_video_example.mp4",
    poster: "/smartwatch.webp",
    accent: "sky",
  },
  {
    slug: "movie-poster",
    title: "Movie Poster Generator",
    category: "Design",
    teaser:
      "From a title, genre, and audience, the canvas writes a creative strategy and renders a batch of cinematic movie poster concepts, title, tagline, billing block and all.",
    pipeline: ["Brief", "Strategy", "Concepts", "Key art"],
    poster: "/poster-singularity-1.webp",
    accent: "violet",
  },
];

export function getUseCase(slug: string): UseCaseEntry | undefined {
  return useCaseEntries.find((entry) => entry.slug === slug);
}
