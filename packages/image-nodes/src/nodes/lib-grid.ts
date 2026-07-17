import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import sharp from "sharp";
import { decodeImage } from "./lib-image-utils.js";

async function loadImageBuffer(
  image: unknown,
  context?: ProcessingContext
): Promise<Buffer> {
  const buf = await decodeImage(image, context);
  if (!buf) throw new Error("Image input is required.");
  return buf;
}

/**
 * Placement of a tile within the original canvas. Emitted by SliceImageGrid on
 * each tile ref's `metadata.grid` so CombineImageGrid can reassemble the source
 * image exactly (lossless round trip), even when the dimensions are not evenly
 * divisible by the column/row count.
 */
type TilePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  row: number;
  column: number;
  columns: number;
  rows: number;
};

function toImageRef(
  buf: Buffer,
  placement?: TilePlacement
): Record<string, unknown> {
  return {
    type: "image",
    data: new Uint8Array(buf),
    mimeType: "image/png",
    metadata: placement ? { grid: placement } : null
  };
}

/**
 * Read tile placement from a ref's `metadata.grid`, or null when absent/malformed.
 * Refs are plain objects, so the placement payload survives transport.
 */
function readPlacement(ref: unknown): TilePlacement | null {
  if (!ref || typeof ref !== "object") return null;
  const md = (ref as Record<string, unknown>).metadata;
  if (!md || typeof md !== "object") return null;
  const grid = (md as Record<string, unknown>).grid;
  if (!grid || typeof grid !== "object") return null;
  const g = grid as Record<string, unknown>;
  const keys: (keyof TilePlacement)[] = [
    "x",
    "y",
    "width",
    "height",
    "canvasWidth",
    "canvasHeight",
    "row",
    "column",
    "columns",
    "rows"
  ];
  for (const k of keys) {
    if (typeof g[k] !== "number" || !Number.isFinite(g[k])) return null;
  }
  return {
    x: g.x as number,
    y: g.y as number,
    width: g.width as number,
    height: g.height as number,
    canvasWidth: g.canvasWidth as number,
    canvasHeight: g.canvasHeight as number,
    row: g.row as number,
    column: g.column as number,
    columns: g.columns as number,
    rows: g.rows as number
  };
}

export class SliceImageGridLibNode extends BaseNode {
  static readonly nodeType = "lib.grid.SliceImageGrid";
  static readonly title = "Slice Image Grid";
  static readonly description =
    "Slice an image into a grid of tiles.\n    image, grid, slice, tiles\n\n    Use cases:\n    - Prepare large images for processing in smaller chunks\n    - Create image puzzles or mosaic effects\n    - Distribute image processing tasks across multiple workers";
  static readonly metadataOutputTypes = {
    output: "list[image]"
  };
  static readonly inlineFields = ["columns", "rows"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to slice into a grid."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 0,
    title: "Columns",
    description:
      "Number of columns in the grid. 0 auto-derives from rows, or falls back to a 3x3 grid when rows is also 0.",
    min: 0
  })
  declare columns: any;

  @prop({
    type: "int",
    default: 0,
    title: "Rows",
    description:
      "Number of rows in the grid. 0 auto-derives from columns, or falls back to a 3x3 grid when columns is also 0.",
    min: 0
  })
  declare rows: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const imageInput = this.image;
    const src = await loadImageBuffer(imageInput, context);
    const srcSharp = sharp(src, { failOn: "none" });
    const meta = await srcSharp.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    if (width <= 0 || height <= 0) {
      throw new Error("Input image has invalid dimensions.");
    }

    let columns = Number(this.columns ?? 0);
    let rows = Number(this.rows ?? 0);

    if (columns <= 0 && rows <= 0) {
      columns = 3;
      rows = 3;
    } else if (columns <= 0) {
      columns = Math.ceil((width / height) * rows);
    } else if (rows <= 0) {
      rows = Math.ceil((height / width) * columns);
    }

    columns = Math.max(1, Math.trunc(columns));
    rows = Math.max(1, Math.trunc(rows));

    const tiles: Array<Record<string, unknown>> = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const x = Math.round((col * width) / columns);
        const y = Math.round((row * height) / rows);
        const right = Math.round(((col + 1) * width) / columns);
        const bottom = Math.round(((row + 1) * height) / rows);
        const tileWidth = Math.max(1, right - x);
        const tileHeight = Math.max(1, bottom - y);
        const out = await sharp(src, { failOn: "none" })
          .extract({
            left: x,
            top: y,
            width: tileWidth,
            height: tileHeight
          })
          .png()
          .toBuffer();
        tiles.push(
          toImageRef(out, {
            x,
            y,
            width: tileWidth,
            height: tileHeight,
            canvasWidth: width,
            canvasHeight: height,
            row,
            column: col,
            columns,
            rows
          })
        );
      }
    }

    return { output: tiles };
  }
}

export class CombineImageGridLibNode extends BaseNode {
  static readonly nodeType = "lib.grid.CombineImageGrid";
  static readonly title = "Combine Image Grid";
  static readonly description =
    "Combine a grid of image tiles into a single image.\n    image, grid, combine, tiles\n\n    Use cases:\n    - Reassemble processed image chunks\n    - Create composite images from smaller parts\n    - Merge tiled image data from distributed processing";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["columns"];
  static readonly inputFields = ["tiles"];

  @prop({
    type: "list[image]",
    default: [],
    title: "Tiles",
    description: "List of image tiles to combine."
  })
  declare tiles: any;

  @prop({
    type: "int",
    default: 0,
    title: "Columns",
    description:
      "Number of columns in the grid. 0 auto-derives from the tile count. Ignored when tiles carry grid placement metadata from SliceImageGrid.",
    min: 0
  })
  declare columns: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const tileInputs = (this.tiles ?? []) as unknown[];
    if (!Array.isArray(tileInputs) || tileInputs.length === 0) {
      throw new Error("No tiles provided for combining.");
    }

    const tiles = await Promise.all(
      tileInputs.map((tile) => loadImageBuffer(tile, context))
    );

    // Lossless path: when every tile carries placement metadata from
    // SliceImageGrid, reassemble onto a canvas of the original dimensions at the
    // exact recorded offsets. Tolerant of non-divisible slicing (varying tile
    // sizes) — no uniform grid, no overlaps, no oversized canvas.
    const placements = tileInputs.map(readPlacement);
    if (placements.every((p): p is TilePlacement => p !== null)) {
      const canvasWidth = placements[0].canvasWidth;
      const canvasHeight = placements[0].canvasHeight;
      const canvas = sharp({
        create: {
          width: Math.max(1, canvasWidth),
          height: Math.max(1, canvasHeight),
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      });
      const composite = tiles.map((tile, index) => ({
        input: tile,
        left: placements[index].x,
        top: placements[index].y
      }));
      const out = await canvas.composite(composite).png().toBuffer();
      return { output: toImageRef(out) };
    }

    const metas = await Promise.all(
      tiles.map((tile) => sharp(tile, { failOn: "none" }).metadata())
    );

    let columns = Number(this.columns ?? 0);
    if (columns <= 0) {
      columns = Math.floor(Math.sqrt(tiles.length));
    }
    columns = Math.max(1, Math.trunc(columns));

    const rows = Math.ceil(tiles.length / columns);
    const maxWidth = Math.max(...metas.map((m) => m.width ?? 1));
    const maxHeight = Math.max(...metas.map((m) => m.height ?? 1));

    const canvas = sharp({
      create: {
        width: maxWidth * columns,
        height: maxHeight * rows,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    const composite = tiles.map((tile, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      return {
        input: tile,
        left: col * maxWidth,
        top: row * maxHeight
      };
    });

    const out = await canvas.composite(composite).png().toBuffer();
    return { output: toImageRef(out) };
  }
}

export const LIB_GRID_NODES = [
  SliceImageGridLibNode,
  CombineImageGridLibNode
] as const;
