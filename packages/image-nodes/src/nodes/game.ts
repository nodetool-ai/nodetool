/**
 * Game asset slot nodes. Each takes a generated image, measures it, and stamps
 * the ref with a `SlotFill` under `metadata.nodetool_slot` so the Godot writer
 * reads frame regions off the sheet without looking at pixels. Nothing here
 * calls a model; generation is upstream.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  SLOT_METADATA_KEY,
  imageFill,
  spritesheetFill,
  tilesetFill,
  type ImageFill,
  type SlotFill,
  type SpritesheetFill,
  type TilesetFill
} from "@nodetool-ai/protocol";
import { loadSharp, SHARP_UNAVAILABLE_MESSAGE } from "./image-io.js";
import { decodeImage } from "./lib-image-utils.js";
import { isObjectLike, isString } from "../type-predicates.js";

/** Animations that play once by default. Everything else loops. */
const ONE_SHOT_ANIMATIONS = ["jump", "hurt", "die", "attack"] as const;

const EMPTY_IMAGE = {
  type: "image",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

type Measured = { buf: Buffer; width: number; height: number; format: string };

async function measureImage(
  nodeName: string,
  image: unknown,
  context?: ProcessingContext
): Promise<Measured> {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error(`${nodeName}: ${SHARP_UNAVAILABLE_MESSAGE}`);
  }
  const buf = await decodeImage(image, context);
  if (!buf) {
    throw new Error(`${nodeName}: image input is required.`);
  }
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`${nodeName}: input image has invalid dimensions.`);
  }
  return { buf, width, height, format: meta.format ?? "png" };
}

function positiveInt(nodeName: string, name: string, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${nodeName}: ${name} must be a positive integer, got ${String(value)}.`);
  }
  return n;
}

/** Columns and rows of a sheet whose size is an exact multiple of the cell. */
function deriveGrid(
  nodeName: string,
  img: Measured,
  cellWidth: number,
  cellHeight: number
): { columns: number; rows: number } {
  if (img.width % cellWidth !== 0 || img.height % cellHeight !== 0) {
    throw new Error(
      `${nodeName}: image ${img.width}x${img.height} is not a multiple of cell ${cellWidth}x${cellHeight}.`
    );
  }
  return { columns: img.width / cellWidth, rows: img.height / cellHeight };
}

function slotIdOf(nodeName: string, value: unknown): string {
  if (!isString(value) || value.length === 0) {
    throw new Error(`${nodeName}: slot_id is required.`);
  }
  return value;
}

/** A dict prop that may arrive as a JSON object string. */
function parseDict(
  nodeName: string,
  name: string,
  value: unknown
): Record<string, unknown> {
  if (value == null || value === "") {
    return {};
  }
  let parsed: unknown = value;
  if (isString(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`${nodeName}: ${name} is not valid JSON.`);
    }
  }
  if (!isObjectLike(parsed) || Array.isArray(parsed)) {
    throw new Error(`${nodeName}: ${name} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Store the stamped sheet as its own asset when the context can, so the fill
 * outlives the run: `export_godot_project` reads it back off the asset row.
 * Without `createAsset` (a hermetic run, a graph with no store) the ref is
 * returned inline and the caller keeps it.
 */
async function persistStamped(
  context: ProcessingContext | undefined,
  nodeName: string,
  slotId: string,
  ref: Record<string, unknown>,
  format: string
): Promise<Record<string, unknown>> {
  if (!context?.hasModelInterface?.("createAsset")) return ref;
  const ext = format === "jpeg" ? "jpg" : format;
  const created = (await context.createAsset({
    name: `${slotId.replace(/\./g, "_")}.${ext}`,
    contentType: `image/${format}`,
    content: ref.data as Uint8Array,
    metadata: ref.metadata as Record<string, unknown>
  })) as Record<string, unknown> | null;
  const id = created ? created["id"] : null;
  if (!isString(id) || id === "") throw new Error(`${nodeName}: the asset was created without an id.`);
  return { ...ref, uri: `asset://${id}.${ext}`, asset_id: id };
}

function stampFill(image: unknown, img: Measured, fill: SlotFill) {
  const source = isObjectLike(image) ? (image as Record<string, unknown>) : {};
  const previous = isObjectLike(source.metadata)
    ? (source.metadata as Record<string, unknown>)
    : {};
  return {
    ...source,
    type: "image",
    data: new Uint8Array(img.buf),
    metadata: { ...previous, [SLOT_METADATA_KEY]: fill }
  };
}

function formatZodIssues(nodeName: string, error: { issues: Array<{ path: PropertyKey[]; message: string }> }): Error {
  const lines = error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
  return new Error(`${nodeName}: fill failed validation. ${lines.join("; ")}`);
}

export class SpriteSheetNode extends BaseNode {
  static readonly nodeType = "nodetool.game.SpriteSheet";
  static readonly title = "Sprite Sheet";
  static readonly description =
    "Describe a generated sprite sheet for a game slot: derive the grid from the cell size, assign each animation a row-major frame range, and stamp the image with the slot fill.\n    game, sprite, spritesheet, animation, godot, slot\n\n    Use cases:\n    - Fill a spritesheet slot of a game template from a generated sheet\n    - Give Godot the frame regions and loop flags without slicing the image\n    - Reject sheets whose size does not match the cell or hold too few frames";
  static readonly metadataOutputTypes = {
    output: "image",
    fill: "dict"
  };
  static readonly inlineFields = ["cell_width", "cell_height", "fps"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The generated sprite sheet."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 32,
    title: "Cell Width",
    description: "Pixel width of one frame.",
    min: 1
  })
  declare cell_width: any;

  @prop({
    type: "int",
    default: 32,
    title: "Cell Height",
    description: "Pixel height of one frame.",
    min: 1
  })
  declare cell_height: any;

  @prop({
    type: "dict",
    default: {},
    title: "Animations",
    description:
      "Animation name to frame count, in sheet order. A dict or a JSON object string, e.g. {\"idle\": 4, \"run\": 8}."
  })
  declare animations: any;

  @prop({
    type: "int",
    default: 8,
    title: "FPS",
    description: "Frames per second for every animation.",
    min: 1
  })
  declare fps: any;

  @prop({
    type: "str",
    default: "",
    title: "Slot ID",
    description: "The manifest slot this sheet fills, e.g. player."
  })
  declare slot_id: any;

  @prop({
    type: "dict",
    default: {},
    title: "Loop",
    description:
      "Per-animation loop overrides, name to boolean. By default every animation loops except jump, hurt, die and attack."
  })
  declare loop: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const name = SpriteSheetNode.title;
    const img = await measureImage(name, this.image, context);
    const cellWidth = positiveInt(name, "cell_width", this.cell_width);
    const cellHeight = positiveInt(name, "cell_height", this.cell_height);
    const fps = positiveInt(name, "fps", this.fps);
    const slotId = slotIdOf(name, this.slot_id);
    const { columns, rows } = deriveGrid(name, img, cellWidth, cellHeight);

    const requested = parseDict(name, "animations", this.animations);
    const entries = Object.entries(requested);
    if (entries.length === 0) {
      throw new Error(`${name}: animations must name at least one animation.`);
    }
    const overrides = new Map<string, boolean>();
    for (const [animation, value] of Object.entries(parseDict(name, "loop", this.loop))) {
      if (value !== true && value !== false) {
        throw new Error(`${name}: loop.${animation} must be true or false.`);
      }
      overrides.set(animation, value);
    }

    const capacity = columns * rows;
    const animations: SpritesheetFill["animations"] = {};
    let cursor = 0;
    for (const [animation, count] of entries) {
      const frames = positiveInt(name, `animations.${animation}`, count);
      const loop =
        overrides.get(animation) ??
        !(ONE_SHOT_ANIMATIONS as readonly string[]).includes(animation);
      animations[animation] = {
        from: cursor,
        to: cursor + frames - 1,
        fps,
        loop
      };
      cursor += frames;
    }
    if (cursor > capacity) {
      throw new Error(
        `${name}: animations need ${cursor} frames, sheet holds ${capacity} (${columns}x${rows}).`
      );
    }

    const parsed = spritesheetFill.safeParse({
      kind: "spritesheet",
      slot_id: slotId,
      cell: [cellWidth, cellHeight],
      columns,
      rows,
      animations
    });
    if (!parsed.success) {
      throw formatZodIssues(name, parsed.error);
    }
    return {
      output: await persistStamped(
        context,
        name,
        parsed.data.slot_id,
        stampFill(this.image, img, parsed.data),
        img.format
      ),
      fill: parsed.data
    };
  }
}

export class TilesetNode extends BaseNode {
  static readonly nodeType = "nodetool.game.Tileset";
  static readonly title = "Tileset";
  static readonly description =
    "Describe a generated tileset for a game slot: derive the grid from the cell size and stamp the image with the slot fill.\n    game, tileset, tiles, tilemap, godot, slot\n\n    Use cases:\n    - Fill a tileset slot of a game template from a generated sheet\n    - Give Godot the cell size and tile count without slicing the image\n    - Reject sheets whose size does not match the cell or hold too few tiles";
  static readonly metadataOutputTypes = {
    output: "image",
    fill: "dict"
  };
  static readonly inlineFields = ["cell_width", "cell_height", "count"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The generated tileset sheet."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 16,
    title: "Cell Width",
    description: "Pixel width of one tile.",
    min: 1
  })
  declare cell_width: any;

  @prop({
    type: "int",
    default: 16,
    title: "Cell Height",
    description: "Pixel height of one tile.",
    min: 1
  })
  declare cell_height: any;

  @prop({
    type: "int",
    default: 1,
    title: "Count",
    description: "Number of distinct tiles on the sheet, row-major from the top left.",
    min: 1
  })
  declare count: any;

  @prop({
    type: "str",
    default: "",
    title: "Slot ID",
    description: "The manifest slot this tileset fills, e.g. tiles.ground."
  })
  declare slot_id: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const name = TilesetNode.title;
    const img = await measureImage(name, this.image, context);
    const cellWidth = positiveInt(name, "cell_width", this.cell_width);
    const cellHeight = positiveInt(name, "cell_height", this.cell_height);
    const count = positiveInt(name, "count", this.count);
    const slotId = slotIdOf(name, this.slot_id);
    const { columns, rows } = deriveGrid(name, img, cellWidth, cellHeight);
    if (count > columns * rows) {
      throw new Error(
        `${name}: ${count} tiles do not fit ${columns}x${rows}.`
      );
    }
    const parsed = tilesetFill.safeParse({
      kind: "tileset",
      slot_id: slotId,
      cell: [cellWidth, cellHeight],
      columns,
      rows,
      count
    } satisfies TilesetFill);
    if (!parsed.success) {
      throw formatZodIssues(name, parsed.error);
    }
    return {
      output: await persistStamped(
        context,
        name,
        parsed.data.slot_id,
        stampFill(this.image, img, parsed.data),
        img.format
      ),
      fill: parsed.data
    };
  }
}

/**
 * Mean absolute per-channel (RGB) difference between two pixel lines of an
 * RGBA buffer, given the byte offset of pixel i on each line.
 */
function meanEdgeDifference(
  rgba: Buffer,
  length: number,
  offsetA: (i: number) => number,
  offsetB: (i: number) => number
): number {
  let total = 0;
  for (let i = 0; i < length; i++) {
    const a = offsetA(i);
    const b = offsetB(i);
    for (let c = 0; c < 3; c++) {
      total += Math.abs(rgba[a + c] - rgba[b + c]);
    }
  }
  return total / (length * 3);
}

export class SeamlessImageNode extends BaseNode {
  static readonly nodeType = "nodetool.game.SeamlessImage";
  static readonly title = "Seamless Image";
  static readonly description =
    "Describe a generated image for a game slot: measure it, compare its opposite edges to decide whether it tiles, and stamp the image with the slot fill.\n    game, image, seamless, tileable, background, godot, slot\n\n    Use cases:\n    - Fill an image slot of a game template from a generated background\n    - Prove a background tiles horizontally before Godot scrolls it\n    - Reject images that a template expects to tile but do not";
  static readonly metadataOutputTypes = {
    output: "image",
    fill: "dict"
  };
  static readonly inlineFields = ["check_x", "check_y", "threshold"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The generated image."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Slot ID",
    description: "The manifest slot this image fills, e.g. bg.far."
  })
  declare slot_id: any;

  @prop({
    type: "bool",
    default: true,
    title: "Check X",
    description:
      "Compare the left and right columns. When off, seamless_x is reported false."
  })
  declare check_x: any;

  @prop({
    type: "bool",
    default: false,
    title: "Check Y",
    description:
      "Compare the top and bottom rows. When off, seamless_y is reported false."
  })
  declare check_y: any;

  @prop({
    type: "float",
    default: 12,
    title: "Threshold",
    description:
      "Largest mean absolute per-channel difference (0-255) between opposite edges that still counts as seamless.",
    min: 0,
    max: 255
  })
  declare threshold: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const name = SeamlessImageNode.title;
    const img = await measureImage(name, this.image, context);
    const slotId = slotIdOf(name, this.slot_id);
    const threshold = Number(this.threshold ?? 12);
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error(`${name}: threshold must be a non-negative number.`);
    }
    const checkX = Boolean(this.check_x);
    const checkY = Boolean(this.check_y);

    let seamlessX = false;
    let seamlessY = false;
    if (checkX || checkY) {
      const sharp = await loadSharp();
      if (!sharp) {
        throw new Error(`${name}: ${SHARP_UNAVAILABLE_MESSAGE}`);
      }
      const rgba = await sharp(img.buf, { failOn: "none" })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const { width, height } = img;
      const stride = width * 4;
      if (checkX) {
        const diff = meanEdgeDifference(
          rgba,
          height,
          (y) => y * stride,
          (y) => y * stride + (width - 1) * 4
        );
        seamlessX = diff <= threshold;
      }
      if (checkY) {
        const diff = meanEdgeDifference(
          rgba,
          width,
          (x) => x * 4,
          (x) => (height - 1) * stride + x * 4
        );
        seamlessY = diff <= threshold;
      }
    }

    const parsed = imageFill.safeParse({
      kind: "image",
      slot_id: slotId,
      size: [img.width, img.height],
      seamless_x: seamlessX,
      seamless_y: seamlessY
    } satisfies ImageFill);
    if (!parsed.success) {
      throw formatZodIssues(name, parsed.error);
    }
    return {
      output: await persistStamped(
        context,
        name,
        parsed.data.slot_id,
        stampFill(this.image, img, parsed.data),
        img.format
      ),
      fill: parsed.data
    };
  }
}

export const GAME_NODES = [
  SpriteSheetNode,
  TilesetNode,
  SeamlessImageNode
] as const;
