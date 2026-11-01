import { presetShowcaseEntries } from "./presetShowcase.generated";
import type { PageEntry } from "./types";

export const presetShowcase = presetShowcaseEntries;
export type PresetShowcaseEntry = (typeof presetShowcase)[number];
export type PresetKind = PresetShowcaseEntry["kind"];

export const PRESET_KINDS: readonly {
  readonly id: PresetKind;
  readonly label: string;
  readonly blurb: string;
}[] = [
  {
    id: "camera",
    label: "Camera moves",
    blurb: "Dolly, orbit, crane, pan and the speed of the move."
  },
  {
    id: "look",
    label: "Looks",
    blurb: "Camera bodies, film stocks, grades, lighting and speed ramps."
  },
  {
    id: "effect",
    label: "Effects",
    blurb: "Transformations of the subject, and restyles of a whole video."
  }
];

export const PRESET_DOCS_URL = "https://docs.nodetool.ai/presets";

/** The catalogue stores lowercase camera names. Cards show them capitalised. */
export function presetDisplayName(entry: PresetShowcaseEntry): string {
  return entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
}

/** An element id for a card, so a preset can be linked by anchor. */
export function presetAnchor(entry: PresetShowcaseEntry): string {
  return `preset-${entry.id.replace(/\./g, "-")}`;
}

/** The card a restyle's source video came from. */
export function sourcePresetOf(
  entry: PresetShowcaseEntry
): PresetShowcaseEntry | undefined {
  return presetShowcase.find((preset) => preset.id === entry.sourcePreset);
}

export function presetsOfKind(kind: PresetKind): PresetShowcaseEntry[] {
  return presetShowcase.filter((entry) => entry.kind === kind);
}

/** How a preview was rendered, in the words the record supports. */
export function renderSummary(entry: PresetShowcaseEntry): string {
  switch (entry.mode) {
    case "image_edit":
      return "Image edit, shown as a crossfade from the source still";
    case "reference_to_video":
      return `Video restyle${entry.resolution ? ` at ${entry.resolution}` : ""}`;
    default:
      return entry.resolution ? `Video at ${entry.resolution}` : "Video";
  }
}

export interface ModelCount {
  readonly model: string;
  readonly count: number;
  readonly resolution: string | null;
}

/** Previews per model and resolution, in order of count. */
export function modelCounts(): ModelCount[] {
  const counts = new Map<string, ModelCount>();
  for (const entry of presetShowcase) {
    const resolution = entry.mode === "image_edit" ? null : entry.resolution;
    const key = `${entry.model}|${resolution}`;
    const current = counts.get(key);
    counts.set(key, {
      model: entry.model,
      resolution,
      count: (current?.count ?? 0) + 1
    });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export const presetEntryPages: PageEntry[] = [
  {
    route: "/presets",
    title: "Camera Move, Look and Effect Presets with Preview Renders | NodeTool",
    description:
      "Browse NodeTool's camera move, film look and effect presets, each with a short preview render, the model that made it, and how it was rendered.",
    priority: 0.7,
    changeFrequency: "monthly",
    indexable: true
  }
];
