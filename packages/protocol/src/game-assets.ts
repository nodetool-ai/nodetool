/**
 * @nodetool-ai/protocol – Game asset slots
 *
 * The contract between the three halves of the Godot pipeline, so each can be
 * built and tested without the others:
 *
 *   - A game template declares a {@link GameAssetManifest}: every asset slot
 *     it needs (a sprite sheet with named animations, a tileset, a seamless
 *     background, a sound effect, a music loop) and the script hooks the agent
 *     fills in.
 *   - The generation nodes fill one slot at a time and stamp the stored asset
 *     with a {@link SlotFill} under `metadata.nodetool_slot`, so the layout
 *     (cell size, frame ranges, loop flag) travels with the bytes.
 *   - The Godot writer reads a {@link FilledManifest} and never needs to look
 *     at pixels: the fill tells it where every frame is.
 *
 * {@link checkSlotFill} is the mechanical acceptance every fill passes before
 * it counts as done. It is here rather than in a node so the writer's tests and
 * the generation nodes reject the same things.
 */

import { z } from "zod";

const positiveInt = z.number().int().positive();
const cellSchema = z.tuple([positiveInt, positiveInt]);
const sizeSchema = z.tuple([positiveInt, positiveInt]);
const slotId = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, "dotted lowercase id");
const animationName = z.string().regex(/^[a-z][a-z0-9_]*$/);

// ---------------------------------------------------------------------------
// Manifest: what a template asks for
// ---------------------------------------------------------------------------

export const spritesheetSlotSpec = z.object({
  id: slotId,
  kind: z.literal("spritesheet"),
  /** Pixel size of one frame. */
  cell: cellSchema,
  /** Animation name → frame count, in sheet order. */
  animations: z.record(animationName, positiveInt).refine(
    (a) => Object.keys(a).length > 0,
    "at least one animation"
  ),
  /** Frames per second the template plays these at. */
  fps: positiveInt.default(8),
  /** What the template needs the subject to be; the skill adds style. */
  prompt: z.string().optional()
});

export const tilesetSlotSpec = z.object({
  id: slotId,
  kind: z.literal("tileset"),
  cell: cellSchema,
  /** Number of distinct tiles the template references. */
  count: positiveInt,
  prompt: z.string().optional()
});

export const imageSlotSpec = z.object({
  id: slotId,
  kind: z.literal("image"),
  size: sizeSchema,
  seamless_x: z.boolean().default(false),
  seamless_y: z.boolean().default(false),
  prompt: z.string().optional()
});

export const sfxSlotSpec = z.object({
  id: slotId,
  kind: z.literal("sfx"),
  seconds: z.number().positive(),
  prompt: z.string().optional()
});

export const musicSlotSpec = z.object({
  id: slotId,
  kind: z.literal("music"),
  seconds: z.number().positive(),
  loop: z.boolean().default(true),
  prompt: z.string().optional()
});

export const gameSlotSpec = z.discriminatedUnion("kind", [
  spritesheetSlotSpec,
  tilesetSlotSpec,
  imageSlotSpec,
  sfxSlotSpec,
  musicSlotSpec
]);

export const GAME_SLOT_KINDS = [
  "spritesheet",
  "tileset",
  "image",
  "sfx",
  "music"
] as const;
export type GameSlotKind = (typeof GAME_SLOT_KINDS)[number];

export const gameAssetManifest = z
  .object({
    version: z.literal(1),
    /** Template id, e.g. `platformer`. */
    template: z.string().min(1),
    /** Godot minor the template targets, e.g. `4.3`. */
    godot: z.string().regex(/^\d+\.\d+$/),
    slots: z.array(gameSlotSpec).min(1),
    /** Project-relative files the agent writes or edits after export. */
    hooks: z.array(z.string().min(1)).default([])
  })
  .refine(
    (m) => new Set(m.slots.map((s) => s.id)).size === m.slots.length,
    "slot ids must be unique"
  );

export type SpritesheetSlotSpec = z.infer<typeof spritesheetSlotSpec>;
export type TilesetSlotSpec = z.infer<typeof tilesetSlotSpec>;
export type ImageSlotSpec = z.infer<typeof imageSlotSpec>;
export type SfxSlotSpec = z.infer<typeof sfxSlotSpec>;
export type MusicSlotSpec = z.infer<typeof musicSlotSpec>;
export type GameSlotSpec = z.infer<typeof gameSlotSpec>;
export type GameAssetManifest = z.infer<typeof gameAssetManifest>;

// ---------------------------------------------------------------------------
// Fill: what a generation node produced for one slot
// ---------------------------------------------------------------------------

/** Key under `AssetRef.metadata` that carries a {@link SlotFill}. */
export const SLOT_METADATA_KEY = "nodetool_slot";

const frameRange = z
  .object({
    /** First frame index on the sheet, row-major. */
    from: z.number().int().nonnegative(),
    /** Last frame index, inclusive. */
    to: z.number().int().nonnegative(),
    fps: positiveInt,
    loop: z.boolean()
  })
  .refine((r) => r.to >= r.from, "to >= from");

export const spritesheetFill = z.object({
  kind: z.literal("spritesheet"),
  slot_id: slotId,
  cell: cellSchema,
  columns: positiveInt,
  rows: positiveInt,
  animations: z.record(animationName, frameRange)
});

export const tilesetFill = z.object({
  kind: z.literal("tileset"),
  slot_id: slotId,
  cell: cellSchema,
  columns: positiveInt,
  rows: positiveInt,
  count: positiveInt
});

export const imageFill = z.object({
  kind: z.literal("image"),
  slot_id: slotId,
  size: sizeSchema,
  seamless_x: z.boolean(),
  seamless_y: z.boolean()
});

export const sfxFill = z.object({
  kind: z.literal("sfx"),
  slot_id: slotId,
  seconds: z.number().positive()
});

export const musicFill = z.object({
  kind: z.literal("music"),
  slot_id: slotId,
  seconds: z.number().positive(),
  loop: z.boolean()
});

export const slotFill = z.discriminatedUnion("kind", [
  spritesheetFill,
  tilesetFill,
  imageFill,
  sfxFill,
  musicFill
]);

/** The stored asset a fill points at. The writer copies these bytes. */
export const filledSlotAsset = z.object({
  type: z.enum(["asset", "image", "audio"]),
  uri: z.string().min(1),
  asset_id: z.string().min(1)
});

export const filledSlot = z.object({
  slot_id: slotId,
  asset: filledSlotAsset,
  fill: slotFill
});

export const filledManifest = z
  .object({
    manifest_version: z.literal(1),
    template: z.string().min(1),
    slots: z.array(filledSlot)
  })
  .refine(
    (m) => m.slots.every((s) => s.slot_id === s.fill.slot_id),
    "fill.slot_id must match slot_id"
  );

export type SpritesheetFill = z.infer<typeof spritesheetFill>;
export type TilesetFill = z.infer<typeof tilesetFill>;
export type ImageFill = z.infer<typeof imageFill>;
export type SfxFill = z.infer<typeof sfxFill>;
export type MusicFill = z.infer<typeof musicFill>;
export type SlotFill = z.infer<typeof slotFill>;
export type FilledSlot = z.infer<typeof filledSlot>;
export type FilledManifest = z.infer<typeof filledManifest>;

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

/** Duration slack for generated audio, as a fraction of the requested length. */
export const AUDIO_SECONDS_TOLERANCE = 0.25;

/**
 * Every way a fill fails the slot that asked for it. Empty means accepted.
 *
 * A fill of the wrong kind is one problem, not a cascade: nothing else is
 * compared when the kinds differ.
 */
export function checkSlotFill(spec: GameSlotSpec, fill: SlotFill): string[] {
  if (fill.slot_id !== spec.id) {
    return [`slot_id ${fill.slot_id} is not ${spec.id}`];
  }
  if (fill.kind !== spec.kind) {
    return [`kind ${fill.kind} is not ${spec.kind}`];
  }
  const problems: string[] = [];
  switch (spec.kind) {
    case "spritesheet": {
      const f = fill as SpritesheetFill;
      if (f.cell[0] !== spec.cell[0] || f.cell[1] !== spec.cell[1]) {
        problems.push(`cell ${f.cell.join("x")} is not ${spec.cell.join("x")}`);
      }
      const capacity = f.columns * f.rows;
      for (const [name, frames] of Object.entries(spec.animations)) {
        const range = f.animations[name];
        if (!range) {
          problems.push(`animation ${name} missing`);
          continue;
        }
        const got = range.to - range.from + 1;
        if (got !== frames) {
          problems.push(`animation ${name} has ${got} frames, wants ${frames}`);
        }
        if (range.to >= capacity) {
          problems.push(
            `animation ${name} ends at frame ${range.to}, sheet holds ${capacity}`
          );
        }
      }
      break;
    }
    case "tileset": {
      const f = fill as TilesetFill;
      if (f.cell[0] !== spec.cell[0] || f.cell[1] !== spec.cell[1]) {
        problems.push(`cell ${f.cell.join("x")} is not ${spec.cell.join("x")}`);
      }
      if (f.count < spec.count) {
        problems.push(`${f.count} tiles, wants ${spec.count}`);
      }
      if (f.count > f.columns * f.rows) {
        problems.push(`${f.count} tiles do not fit ${f.columns}x${f.rows}`);
      }
      break;
    }
    case "image": {
      const f = fill as ImageFill;
      if (f.size[0] !== spec.size[0] || f.size[1] !== spec.size[1]) {
        problems.push(`size ${f.size.join("x")} is not ${spec.size.join("x")}`);
      }
      if (spec.seamless_x && !f.seamless_x) {
        problems.push("not seamless on x");
      }
      if (spec.seamless_y && !f.seamless_y) {
        problems.push("not seamless on y");
      }
      break;
    }
    case "sfx":
    case "music": {
      const f = fill as SfxFill | MusicFill;
      const slack = spec.seconds * AUDIO_SECONDS_TOLERANCE;
      if (Math.abs(f.seconds - spec.seconds) > slack) {
        problems.push(`${f.seconds}s is not within ${slack}s of ${spec.seconds}s`);
      }
      if (spec.kind === "music" && spec.loop && !(f as MusicFill).loop) {
        problems.push("not a loop");
      }
      break;
    }
  }
  return problems;
}

/**
 * Check a whole filled manifest against the template's manifest: every slot
 * filled once, every fill accepted, nothing filled that was never asked for.
 */
export function checkFilledManifest(
  manifest: GameAssetManifest,
  filled: FilledManifest
): Record<string, string[]> {
  const problems: Record<string, string[]> = {};
  const specs = new Map(manifest.slots.map((s) => [s.id, s]));
  const seen = new Set<string>();
  if (filled.template !== manifest.template) {
    problems[""] = [`template ${filled.template} is not ${manifest.template}`];
  }
  for (const slot of filled.slots) {
    const spec = specs.get(slot.slot_id);
    if (!spec) {
      problems[slot.slot_id] = ["not in manifest"];
      continue;
    }
    if (seen.has(slot.slot_id)) {
      problems[slot.slot_id] = ["filled twice"];
      continue;
    }
    seen.add(slot.slot_id);
    const p = checkSlotFill(spec, slot.fill);
    if (p.length > 0) {
      problems[slot.slot_id] = p;
    }
  }
  for (const id of specs.keys()) {
    if (!seen.has(id)) {
      problems[id] = ["unfilled"];
    }
  }
  return problems;
}
