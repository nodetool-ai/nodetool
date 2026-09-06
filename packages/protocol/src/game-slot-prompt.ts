/**
 * @nodetool-ai/protocol — One game asset slot, turned into a generation job.
 *
 * A {@link GameSlotSpec} says what a template needs; a generator needs a
 * prompt and a canvas; the `nodetool.game.*` checker that accepts the result
 * needs numbers. {@link slotPrompt} is the one mapping between them, pure, so
 * the `nodetool.game.SlotPrompt` node, the `godot-game` skill and the editor
 * all size a sheet and word a prompt the same way.
 *
 * Three rules the tests pin:
 *
 * - **The canvas follows the slot, not the model.** A spritesheet is as wide as
 *   its longest animation and as tall as its animation count; a tileset is the
 *   near-square grid that holds `count` cells; an image is its declared size.
 *   Audio has no canvas, so `width` and `height` are 0.
 * - **`checker` is the matching checker's prop bag**, key for key, so a graph
 *   can `Switch` on `slot.kind` and hand the bag straight to
 *   `SpriteSheet` / `Tileset` / `SeamlessImage` / `SoundEffect` / `MusicLoop`
 *   with no hand-copied numbers.
 * - **Every entity handed to a slot applies to it.** A template's own slot
 *   prompt is generic ("the player character"), so the name matching a
 *   storyboard shot uses would drop the character the sheet is *for*. The
 *   graph author decides the cast per slot instead, and the injection itself is
 *   {@link injectEntities}, unchanged — same block, same order, same reference
 *   images as a shot render.
 */

import { z } from "zod";

import { injectEntities, type Entity } from "./creative.js";
import { gameSlotSpec, type GameSlotKind, type GameSlotSpec } from "./game-assets.js";

export interface SlotPromptResult {
  /** The generation prompt, with the entity block already appended. */
  prompt: string;
  /** Canvas width in pixels; 0 for a slot with no canvas (sfx, music). */
  width: number;
  /** Canvas height in pixels; 0 for a slot with no canvas (sfx, music). */
  height: number;
  /** The prop bag the `nodetool.game.*` checker for this kind takes. */
  checker: Record<string, unknown>;
}

/**
 * What an unwired `game_slot` prop looks like: its `null` default, an absent
 * value, or the empty object a serialized graph can carry in its place.
 */
const unwiredSlot = z.union([
  z.null(),
  z.undefined(),
  z.literal(""),
  z.strictObject({})
]);

/**
 * The slot a `game_slot` input carries, or null when nothing is wired.
 *
 * A checker takes its numbers from the slot when one is connected, so an unset
 * input has to be told apart from a malformed one: unset falls back to the
 * hand-typed props, malformed throws. Silently falling back on a bad slot is
 * the failure this exists to prevent — the node would then stamp a fill from
 * numbers nobody checked.
 */
export function readSlotProp(
  value: unknown,
  expected?: GameSlotKind
): GameSlotSpec | null {
  if (unwiredSlot.safeParse(value).success) {
    return null;
  }
  const parsed = gameSlotSpec.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`slot is not a game slot spec. ${issues}`);
  }
  if (expected && parsed.data.kind !== expected) {
    throw new Error(
      `slot ${parsed.data.id} is a ${parsed.data.kind} slot, not a ${expected} slot.`
    );
  }
  return parsed.data;
}

/** Columns and rows of the squarest grid that holds `count` cells. */
export function nearSquareGrid(count: number): {
  columns: number;
  rows: number;
} {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return { columns, rows: Math.max(1, Math.ceil(count / columns)) };
}

/**
 * The entities that season a slot: the style first, then the cast, each id
 * once.
 *
 * Unlike `entitiesForShot` nothing is matched by name. A slot's text comes from
 * the template and names roles, not cast — `enemy.walker` says "a small ground
 * enemy", never "Pip" — so name matching would season the sheet with the style
 * and silently leave the character out. What a slot gets is what the caller
 * wired to it.
 */
export function slotCast(
  style: Entity | null,
  cast: readonly Entity[]
): Entity[] {
  const applied: Entity[] = [];
  const seen = new Set<string>();
  for (const entity of [style, ...cast]) {
    if (!entity || seen.has(entity.id)) continue;
    seen.add(entity.id);
    applied.push(entity);
  }
  return applied;
}

/** `0-3: idle. 4-11: run.` — where the checker will look for each animation. */
function frameRanges(animations: Record<string, number>): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const [name, frames] of Object.entries(animations)) {
    const last = cursor + frames - 1;
    parts.push(
      frames === 1
        ? `frame ${cursor} is ${name}`
        : `frames ${cursor}-${last} are ${name}`
    );
    cursor += frames;
  }
  return parts.join(", ");
}

const PIXEL_RULES =
  "No anti-aliasing, no drop shadow, no grid lines, no labels or text.";

/** What the slot asks for, before any entity is injected. */
function baseText(slot: GameSlotSpec): string {
  const subject = (slot.prompt ?? "").trim() || `the ${slot.id} asset`;
  switch (slot.kind) {
    case "spritesheet": {
      const columns = Math.max(...Object.values(slot.animations));
      const rows = Object.keys(slot.animations).length;
      return [
        subject,
        `Sprite sheet: ${columns * slot.cell[0]}x${rows * slot.cell[1]} pixels, a ` +
          `${columns}x${rows} grid of ${slot.cell[0]}x${slot.cell[1]} frames, filled ` +
          `row-major from the top left with no gaps — ${frameRanges(slot.animations)}. ` +
          `Leave every remaining cell empty. Transparent background. ${PIXEL_RULES}`
      ].join("\n\n");
    }
    case "tileset": {
      const { columns, rows } = nearSquareGrid(slot.count);
      return [
        subject,
        `Tile sheet: ${columns * slot.cell[0]}x${rows * slot.cell[1]} pixels, a ` +
          `${columns}x${rows} grid of ${slot.cell[0]}x${slot.cell[1]} tiles, ` +
          `${slot.count} distinct tiles row-major from the top left. Each tile fills ` +
          `its cell edge to edge and joins its neighbours without a seam. ${PIXEL_RULES}`
      ].join("\n\n");
    }
    case "image": {
      const tiles = [
        slot.seamless_x ? "left and right edges match" : "",
        slot.seamless_y ? "top and bottom edges match" : ""
      ].filter((part) => part !== "");
      const seamless =
        tiles.length > 0
          ? ` Tiles seamlessly: the ${tiles.join(", and the ")}.`
          : "";
      return [
        subject,
        `Image: ${slot.size[0]}x${slot.size[1]} pixels.${seamless} ${PIXEL_RULES}`
      ].join("\n\n");
    }
    case "sfx":
      return [
        subject,
        `Sound effect: ${slot.seconds} seconds, starting on the first sample with ` +
          `no lead-in silence and ending before the target length.`
      ].join("\n\n");
    case "music":
      return [
        subject,
        slot.loop
          ? `Music: ${slot.seconds} seconds, looping with no audible seam where the ` +
            `end meets the start.`
          : `Music: ${slot.seconds} seconds.`
      ].join("\n\n");
  }
}

/**
 * The prop bag for the `nodetool.game.*` node that accepts this kind of fill.
 *
 * Every key here is a declared `@prop` on that node —
 * `packages/game-nodes/tests/checker-props.test.ts` reads the node metadata and
 * fails when the two drift. Props the slot says nothing about (`loop`,
 * `threshold`, `trim`, `crossfade_ms`) are left off so the node's own default
 * applies.
 *
 * The checkers read this themselves: a connected `slot` input overrides the
 * hand-typed numbers with exactly these keys, so a stale `cell_width` left over
 * from an earlier wiring cannot reach the fill.
 */
export function slotCheckerProps(slot: GameSlotSpec): Record<string, unknown> {
  switch (slot.kind) {
    case "spritesheet":
      return {
        slot_id: slot.id,
        cell_width: slot.cell[0],
        cell_height: slot.cell[1],
        animations: { ...slot.animations },
        fps: slot.fps
      };
    case "tileset":
      return {
        slot_id: slot.id,
        cell_width: slot.cell[0],
        cell_height: slot.cell[1],
        count: slot.count
      };
    case "image":
      return {
        slot_id: slot.id,
        check_x: slot.seamless_x,
        check_y: slot.seamless_y
      };
    case "sfx":
    case "music":
      return { slot_id: slot.id, seconds: slot.seconds };
  }
}

/** Canvas the generator should produce; audio slots have none. */
function canvas(slot: GameSlotSpec): { width: number; height: number } {
  switch (slot.kind) {
    case "spritesheet":
      return {
        width: Math.max(...Object.values(slot.animations)) * slot.cell[0],
        height: Object.keys(slot.animations).length * slot.cell[1]
      };
    case "tileset": {
      const { columns, rows } = nearSquareGrid(slot.count);
      return { width: columns * slot.cell[0], height: rows * slot.cell[1] };
    }
    case "image":
      return { width: slot.size[0], height: slot.size[1] };
    case "sfx":
    case "music":
      return { width: 0, height: 0 };
  }
}

/**
 * Everything needed to fill one slot: the seasoned prompt, the canvas, and the
 * checker's prop bag.
 *
 * Swapping `style` is what makes a re-skin one edit: it applies to every slot,
 * so the pack stays consistent by construction (see {@link slotCast}).
 */
export function slotPrompt(
  slot: GameSlotSpec,
  style: Entity | null,
  cast: readonly Entity[] = []
): SlotPromptResult {
  const applied = slotCast(style, cast);
  const injected = injectEntities(
    baseText(slot),
    applied,
    applied.map((entity) => entity.id)
  );
  return {
    prompt: injected.prompt,
    ...canvas(slot),
    checker: slotCheckerProps(slot)
  };
}
