import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadSharp, SHARP_UNAVAILABLE_MESSAGE } from "./image-io.js";
import { decodeImage } from "./lib-image-utils.js";

async function requireSharp() {
  const sharp = await loadSharp();
  if (!sharp) throw new Error(SHARP_UNAVAILABLE_MESSAGE);
  return sharp;
}

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
 * each tile ref's `metadata.grid` so a reassembling step — `image.grid` in a
 * Code node — can restore the source image exactly (lossless round trip), even
 * when the dimensions are not evenly divisible by the column/row count.
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
) {
  return {
    type: "image",
    data: new Uint8Array(buf),
    mimeType: "image/png",
    metadata: placement ? { grid: placement } : null
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
    const sharp = await requireSharp();
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

export const LIB_GRID_NODES = [SliceImageGridLibNode] as const;
