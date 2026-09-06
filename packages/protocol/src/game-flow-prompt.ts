/**
 * One asset slot → one generator prompt, one exact pixel size and the aspect
 * ratio to ask for (game-prd § 5.3).
 *
 * The wording, the canvas and the entity block are {@link slotPrompt}'s, so a
 * slot filled by the guided flow and one filled by the `nodetool.game.SlotPrompt`
 * node read the same. What this module adds is what the flow needs and the node
 * does not: the designer's reviewed subject in place of the template's generic
 * one, the style preset and cast member as inline entities, and the generator's
 * aspect ratio — the closest of `nodetool.image.TextToImage`'s own list, so the
 * resize step only scales and never crops.
 *
 * Pure, so the browser flow's preview and the graph builder read the same string.
 */

import type { Entity } from "./creative.js";
import type { GameSlotSpec } from "./game-assets.js";
import { nearSquareGrid, slotPrompt } from "./game-slot-prompt.js";

/**
 * The aspect ratios `nodetool.image.TextToImage` accepts, in its own order.
 *
 * Duplicated rather than imported: `@nodetool-ai/protocol` sits below
 * `@nodetool-ai/image-nodes` in the package graph. `game-flow-prompt.test.ts`
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
 * list to the slot's real shape. Distance is measured in log space — 21:9 is as
 * far from 16:9 as 9:21 is from 9:16 — and the first entry wins a tie, which
 * keeps the answer stable when the table gains a ratio.
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
  name?: string;
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

/** The grid a sheet slot is laid out on; nothing for the other kinds. */
function gridOf(slot: GameSlotSpec): { columns?: number; rows?: number } {
  switch (slot.kind) {
    case "spritesheet":
      return {
        columns: Math.max(...Object.values(slot.animations)),
        rows: Object.keys(slot.animations).length
      };
    case "tileset":
      return nearSquareGrid(slot.count);
    default:
      return {};
  }
}

/**
 * Build the generator prompt and target size for one slot.
 *
 * `subject` is the reviewed slot prompt from the design; it replaces the
 * template's own generic subject, and an empty one leaves the template's.
 * `style` is the chosen preset; its descriptor is pasted verbatim so every
 * asset of a game reads as one game. `cast` is the whole cast — only the
 * member whose `slot_id` matches this slot is injected, so a two-character
 * sheet never inherits the other character's colours.
 */
export function gameSlotPrompt(
  slot: GameSlotSpec,
  subject: string,
  style: GameStyleChoice | null,
  cast: readonly GameCastEntry[]
): GameSlotPromptResult {
  const reviewed = subject.trim();
  const spec: GameSlotSpec =
    reviewed === "" ? slot : { ...slot, prompt: reviewed };

  // A pixel-ramp descriptor means nothing to a sound model, so the audio kinds
  // are generated from the subject and the length alone.
  const visual = slot.kind !== "sfx" && slot.kind !== "music";
  const styleEntity: Entity | null =
    style && visual
    ? {
        type: "entity",
        id: "game-style",
        kind: "style",
        name: style.name ?? "Style",
        descriptor: style.descriptor
      }
    : null;
  const member = visual
    ? cast.find((entry) => entry.slot_id === slot.id) ?? null
    : null;
  const castEntities: Entity[] = member
    ? [
        {
          type: "entity",
          id: `game-cast-${member.slot_id}`,
          kind: "character",
          name: member.name,
          descriptor: member.descriptor
        }
      ]
    : [];

  const built = slotPrompt(spec, styleEntity, castEntities);
  if (!visual) {
    return { prompt: built.prompt };
  }
  return {
    prompt: built.prompt,
    width: built.width,
    height: built.height,
    aspectRatio: closestGameAspectRatio(built.width, built.height),
    ...gridOf(slot)
  };
}
