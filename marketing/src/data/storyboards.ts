import { storyboardEntries } from "./storyboardEntries.generated";
import type { PageEntry } from "./types";
import type { QaPair } from "@/lib/jsonld";

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

// Checked against docs/storyboard-editor.md (Board settings, In this shot,
// Render stills and clips, Assemble a timeline, the board menu).
export const STORYBOARD_FAQ: readonly QaPair[] = [
  {
    question: "Is the NodeTool storyboard generator free?",
    answer:
      "NodeTool is open source (AGPL-3.0) and free to download for macOS, Windows, and Linux. Renders run on your own provider keys, so you pay the model provider for each still and clip. The render dialog shows the estimated price before you confirm."
  },
  {
    question: "How do I keep a character consistent across storyboard shots?",
    answer:
      "Save the character as an entity and attach it to each shot it appears in. Entities can be characters, locations, styles, or props, and a still model that takes reference images uses them. If the still model you picked cannot take reference images, the editor shows a warning under the model picker."
  },
  {
    question: "Can I turn an AI storyboard into a video?",
    answer:
      "Yes. Each shot holds a still and a clip. Create timeline builds a timeline from the current stills and clips, where you can trim, split, and export the film. Shots without a still or a clip are skipped."
  },
  {
    question: "Which aspect ratios can a storyboard use?",
    answer:
      "A board is 16:9, 9:16, 1:1, 4:3, or 21:9. Each shot carries its own prompt, camera setup, motion, and duration, so you can change one shot without re-rendering the others."
  },
  {
    question: "Can I export a storyboard?",
    answer:
      "Download ZIP in the board menu saves the board as Markdown with its stills and clips. Send to workflow passes the same stills and clips to a node workflow."
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
    title: "AI Storyboard Generator with Editable Shots | NodeTool",
    description:
      "An open-source AI storyboard generator: turn a brief into scenes and shots, render stills and clips per shot, and assemble an editable timeline. Browse finished films with their storyboards.",
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
