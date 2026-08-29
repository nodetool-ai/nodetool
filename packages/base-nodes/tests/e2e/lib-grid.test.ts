import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { LIB_GRID_NODES, registerBaseNodes } from "../../src/index.js";
import { NodeRegistry } from "@nodetool-ai/node-sdk";

async function solid(
  width: number,
  height: number,
  color: string
): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color
    }
  })
    .png()
    .toBuffer();
  return { data: new Uint8Array(buf) };
}

describe("native lib.grid nodes", () => {
  it("registers SliceImageGrid, and no longer CombineImageGrid", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);

    expect(registry.has("lib.grid.SliceImageGrid")).toBe(true);
    // Retired in favour of the sandbox's `image.grid` capability.
    expect(registry.has("lib.grid.CombineImageGrid")).toBe(false);
  });

  it("slices image into expected number of tiles", async () => {
    const cls = LIB_GRID_NODES.find(
      (n) => n.nodeType === "lib.grid.SliceImageGrid"
    );
    if (!cls) throw new Error("missing SliceImageGrid node");

    const node = new cls();
    const image = await solid(6, 4, "#ff0000");
    node.assign({ image, columns: 3, rows: 2 });
    const out = await node.process();

    const tiles = out.output as Array<Record<string, unknown>>;
    expect(Array.isArray(tiles)).toBe(true);
    expect(tiles).toHaveLength(6);

    const meta = await sharp(Buffer.from(tiles[0].data as Uint8Array)).metadata();
    expect(meta.width).toBe(2);
    expect(meta.height).toBe(2);
  });
});
