/**
 * One asset slot → one generator prompt and one exact pixel size
 * (game-prd § 5.3).
 *
 * The designer writes the *subject* of a slot — "a young fox in a patched
 * scarf" — and nothing else. Everything mechanical is added here: the sheet
 * grid the checker will measure, the animation rows in sheet order, the cast
 * member's descriptor, and the style descriptor verbatim. That split is what
 * lets the design be edited as prose while the graph stays a pure function of
 * the manifest (D26).
 *
 * Pure, no imports beyond the slot specs, so the browser flow's preview and
 * the graph builder read the same string.
 */

import type { GameSlotSpec } from "./game-assets.js";

/**
 * The aspect ratios `nodetool.image.TextToImage` accepts, in its own order.
 *
 * Duplicated rather than imported: `@nodetool-ai/protocol` sits below
 * `@nodetool-ai/image-nodes` in the package graph. `game-slot-prompt.test.ts`
 * reads the node's source and fails when the two lists drift.
 */
export const GAME_IMAGE_ASPECT_RATIOS: Readonly<Record<string, number>> = {
  "21:9": 21 / 9,
  "16:9": 16 / 9,
  "3:2": 3 / 2,
  "7:5": 7 / 5,
  "4:3": 4 / 3,
  "5:4": 5 / 4,
  "1:1": 1,
  "9:16": 9 / 16,
  "2:3": 2 / 3,
  "5:7": 5 / 7,
  "3:4": 3 / 4,
  "4:5": 4 / 5
};

/**
 * The aspect ratio the generator is asked for: the closest of the node's own
 * list to the slot's real shape, so the resize step only scales and never
 * crops. Distance is measured in log space — 21:9 is as far from 16:9 as
 * 9:21 is from 9:16 — and the first entry wins a tie, which keeps the answer
 * stable when the table gains a ratio.
 */
export function closestGameAspectRatio(width: number, height: number): string {
  const target = Math.log(width / height);
  let best = "1:1";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, ratio] of Object.entries(GAME_IMAGE_ASPECT_RATIOS)) {
    const distance = Math.abs(Math.log(ratio) - target);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}

/** The style the whole game reads in. Its descriptor is pasted verbatim. */
export interface GameStyleChoice {
  descriptor: string;
}

/** One cast member, as the design stores it. */
export interface GameCastEntry {
  slot_id: string;
  name: string;
  descriptor: string;
}

export interface GameSlotPromptResult {
  /** The whole prompt the generator node gets. */
  prompt: string;
  /**
   * Exact pixel size the checker will demand. Absent for `sfx` and `music`,
   * which have no size — a caller that wires a resize node must skip them.
   */
  width?: number;
  height?: number;
  /** The generator's aspect ratio. Absent for `sfx` and `music`. */
  aspectRatio?: string;
  /** Sheet grid, for the kinds that have one. */
  columns?: number;
  rows?: number;
}

const sentence = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const join = (parts: readonly string[]): string =>
  parts
    .map(sentence)
    .filter((part) => part.length > 0)
    .join(" ");

/** A number the prompt can read: 0.4, not 0.4000000000000001. */
const seconds = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);

/**
 * Build the generator prompt and target size for one slot.
 *
 * `subject` is the reviewed slot prompt from the design. `style` is the chosen
 * preset or entity; its descriptor is pasted verbatim so every asset of a game
 * reads as one game. `cast` is the whole cast — only the member whose
 * `slot_id` matches this slot contributes, so a two-character sheet never
 * inherits the other character's colours.
 */
export function gameSlotPrompt(
  slot: GameSlotSpec,
  subject: string,
  style: GameStyleChoice | null,
  cast: readonly GameCastEntry[]
): GameSlotPromptResult {
  const member = cast.find((entry) => entry.slot_id === slot.id) ?? null;
  const styleText = style?.descriptor ?? "";

  switch (slot.kind) {
    case "spritesheet": {
      const entries = Object.entries(slot.animations);
      const columns = entries.reduce((max, [, frames]) => Math.max(max, frames), 1);
      const rows = entries.length;
      const width = slot.cell[0] * columns;
      const height = slot.cell[1] * rows;
      const layout = entries
        .map(
          ([name, frames], index) =>
            `row ${index + 1} "${name}", ${frames} frame${frames === 1 ? "" : "s"}`
        )
        .join("; ");
      return {
        prompt: join([
          subject,
          member ? `${member.name}: ${member.descriptor}` : "",
          `A ${columns} by ${rows} sprite sheet, ${slot.cell[0]}x${slot.cell[1]} pixels per frame, one animation per row, frames left to right: ${layout}`,
          "Every frame shows the same character at the same scale, centred in its cell, with unused cells left empty",
          "Transparent background",
          styleText
        ]),
        width,
        height,
        aspectRatio: closestGameAspectRatio(width, height),
        columns,
        rows
      };
    }
    case "tileset": {
      const columns = Math.ceil(Math.sqrt(slot.count));
      const rows = Math.ceil(slot.count / columns);
      const width = slot.cell[0] * columns;
      const height = slot.cell[1] * rows;
      return {
        prompt: join([
          subject,
          `A ${columns} by ${rows} tile sheet holding ${slot.count} distinct ${slot.cell[0]}x${slot.cell[1]} pixel tiles, row-major from the top left, one tile per cell`,
          "Tiles butt against each other without a seam or a border; unused cells are left empty",
          styleText
        ]),
        width,
        height,
        aspectRatio: closestGameAspectRatio(width, height),
        columns,
        rows
      };
    }
    case "image": {
      const [width, height] = slot.size;
      const tiling: string[] = [];
      if (slot.seamless_x) {
        tiling.push("seamless, tileable on the horizontal axis: the left and right edges match exactly");
      }
      if (slot.seamless_y) {
        tiling.push("seamless, tileable on the vertical axis: the top and bottom edges match exactly");
      }
      return {
        prompt: join([
          subject,
          `A single ${width}x${height} pixel image, one flat layer, no characters and no interface`,
          ...tiling,
          styleText
        ]),
        width,
        height,
        aspectRatio: closestGameAspectRatio(width, height)
      };
    }
    case "sfx":
      return {
        prompt: join([
          subject,
          `A single dry game sound effect about ${seconds(slot.seconds)} seconds long, no music, no speech, no reverb tail`
        ])
      };
    case "music":
      return {
        prompt: join([
          subject,
          `An instrumental game music loop about ${seconds(slot.seconds)} seconds long that repeats without a seam, no vocals`
        ])
      };
  }
}
