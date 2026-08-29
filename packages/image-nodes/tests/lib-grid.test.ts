/**
 * SliceImageGrid must emit placement metadata that tiles the source canvas
 * exactly — no gaps, no overlaps — even when the dimensions are not evenly
 * divisible by the column/row count. That metadata is what lets a caller
 * reassemble the original image (`image.grid` in a Code node).
 *
 * These nodes run on the CPU `sharp` codec (no GPU/WebGPU), so no ICD shim is
 * needed. The helper shape follows tests/lib-image-processing.test.ts.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { LIB_GRID_NODES } from "@nodetool-ai/image-nodes";

/** Find a node class by its static nodeType suffix. */
function findNode(suffix: string) {
  const cls = LIB_GRID_NODES.find((n) =>
    (n as unknown as { nodeType: string }).nodeType?.endsWith(suffix)
  );
  if (!cls) throw new Error(`Node ending with "${suffix}" not found`);
  return cls;
}

/** Instantiate a node, assign inputs, call process(), return the raw result. */
async function runNode(
  suffix: string,
  inputs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const Cls = findNode(suffix);
  const node = new (Cls as unknown as {
    new (): {
      assign(p: Record<string, unknown>): void;
      process(ctx?: unknown): Promise<Record<string, unknown>>;
    };
  })();
  node.assign(inputs);
  return node.process();
}

/** A deterministic per-pixel gradient PNG image ref. */
async function makeGradientImage(
  w: number,
  h: number
): Promise<Record<string, unknown>> {
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      pixels[i] = (x * 17 + y * 3) % 256;
      pixels[i + 1] = (x * 5 + y * 23) % 256;
      pixels[i + 2] = (x * 11 + y * 7) % 256;
    }
  }
  const buf = await sharp(pixels, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "" };
}

/** Decode an image ref (Uint8Array or base64 PNG) to raw RGBA + meta. */
async function refToRgba(
  ref: Record<string, unknown>
): Promise<{ rgba: Buffer; width: number; height: number }> {
  const buf =
    ref.data instanceof Uint8Array
      ? Buffer.from(ref.data)
      : Buffer.from(ref.data as string, "base64");
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height };
}

type Placement = {
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

function placementOf(tile: Record<string, unknown>): Placement {
  const md = tile.metadata as { grid?: Placement } | null;
  if (!md?.grid) throw new Error("tile is missing grid placement metadata");
  return md.grid;
}

describe("lib-grid slicing", () => {
  it("SliceImageGrid tile sizes tile exactly, no gaps or overlaps (10x10 into 3x3)", async () => {
    const img = await makeGradientImage(10, 10);
    const result = await runNode(".SliceImageGrid", {
      image: img,
      columns: 3,
      rows: 3
    });
    const tiles = result.output as Array<Record<string, unknown>>;
    expect(tiles).toHaveLength(9);

    const placements = tiles.map(placementOf);
    for (const p of placements) {
      expect(p.canvasWidth).toBe(10);
      expect(p.canvasHeight).toBe(10);
      expect(p.columns).toBe(3);
      expect(p.rows).toBe(3);
    }

    // Each row's tile widths sum to the full canvas width, laid edge to edge.
    for (let row = 0; row < 3; row++) {
      const rowTiles = placements
        .filter((p) => p.row === row)
        .sort((a, b) => a.column - b.column);
      expect(rowTiles.map((p) => p.width).reduce((a, b) => a + b, 0)).toBe(10);
      let cursor = 0;
      for (const p of rowTiles) {
        expect(p.x).toBe(cursor);
        cursor += p.width;
      }
      expect(cursor).toBe(10);
    }

    // Each column's tile heights sum to the full canvas height, edge to edge.
    for (let col = 0; col < 3; col++) {
      const colTiles = placements
        .filter((p) => p.column === col)
        .sort((a, b) => a.row - b.row);
      expect(colTiles.map((p) => p.height).reduce((a, b) => a + b, 0)).toBe(10);
      let cursor = 0;
      for (const p of colTiles) {
        expect(p.y).toBe(cursor);
        cursor += p.height;
      }
      expect(cursor).toBe(10);
    }
  });
});
