import { storyboardEntries } from "./storyboardEntries.generated";
import type { PageEntry } from "./types";

export const storyboards = storyboardEntries;
export type Storyboard = (typeof storyboards)[number];
export type StoryboardShot = Storyboard["shots"][number];
export type StoryboardCategory = Storyboard["category"];

export const STORYBOARD_CATEGORIES: readonly {
  readonly id: StoryboardCategory;
  readonly label: string;
  readonly blurb: string;
}[] = [
  {
    id: "commercial",
    label: "Commercials",
    blurb: "Product spots and short social ads, shot by shot."
  },
  {
    id: "film",
    label: "Film",
    blurb: "Scenes with action, dialogue, and mood."
  },
  {
    id: "animation",
    label: "Animation",
    blurb: "Clay, ink, and clockwork worlds."
  },
  {
    id: "nature",
    label: "Nature",
    blurb: "Wildlife and landscape in the documentary style."
  }
];

export function categoryLabel(category: StoryboardCategory): string {
  return (
    STORYBOARD_CATEGORIES.find((item) => item.id === category)?.label ??
    category
  );
}

export function isVertical(board: Storyboard): boolean {
  return board.video.height > board.video.width;
}

export function getStoryboard(slug: string): Storyboard | undefined {
  return storyboards.find((board) => board.slug === slug);
}

export function storyboardsBySlug(slugs: readonly string[]): Storyboard[] {
  return slugs.flatMap((slug) => {
    const board = getStoryboard(slug);
    return board ? [board] : [];
  });
}

/** Shot start offsets in seconds, scaled to the measured film length. */
export function shotStarts(board: Storyboard): number[] {
  const scale = board.video.duration / board.plannedSeconds;
  let elapsed = 0;
  return board.shots.map((shot) => {
    const start = elapsed * scale;
    elapsed += shot.seconds;
    return Number(start.toFixed(2));
  });
}

export function formatTimecode(seconds: number): string {
  const whole = Math.floor(seconds);
  return `0:${String(whole).padStart(2, "0")}`;
}

export const storyboardEntryPages: PageEntry[] = [
  {
    route: "/storyboards",
    title: "Example storyboards | NodeTool",
    description:
      "Browse finished AI films with their storyboards. Each page shows the video, then every shot with its camera, timing, and direction.",
    priority: 0.8,
    changeFrequency: "monthly",
    indexable: true
  },
  ...storyboards.map(
    (board): PageEntry => ({
      route: board.route,
      title: `${board.title} storyboard | NodeTool`,
      description: board.description,
      priority: 0.6,
      changeFrequency: "monthly",
      indexable: true
    })
  )
];
