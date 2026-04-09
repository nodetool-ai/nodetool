import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
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

function toImageRef(buf: Buffer): Record<string, unknown> {
  return {
    type: "image",
    data: new Uint8Array(buf),
    mimeType: "image/png"
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
    description: "Number of columns in the grid.",
    min: 0
  })
  declare columns: any;

  @prop({
    type: "int",
    default: 0,
    title: "Rows",
    description: "Number of rows in the grid.",
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
        const out = await sharp(src, { failOn: "none" })
          .extract({
            left: x,
            top: y,
            width: Math.max(1, right - x),
            height: Math.max(1, bottom - y)
          })
          .png()
          .toBuffer();
        tiles.push(toImageRef(out));
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
    description: "Number of columns in the grid.",
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
