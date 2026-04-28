import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  CombineImageGridLibNode,
  LIB_GRID_NODES,
  registerBaseNodes
} from "../../src/index.js";
import { NodeRegistry } from "@nodetool/node-sdk";

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
  it("registers grid node types", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);

    expect(registry.has("lib.grid.SliceImageGrid")).toBe(true);
    expect(registry.has("lib.grid.CombineImageGrid")).toBe(true);
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

  it("combines tiles into one output image", async () => {
    const cls = LIB_GRID_NODES.find(
      (n) => n.nodeType === "lib.grid.CombineImageGrid"
    );
    if (!cls) throw new Error("missing CombineImageGrid node");

    const node = new cls();
    const tiles = [
      await solid(10, 10, "#ff0000"),
      await solid(10, 10, "#00ff00"),
      await solid(10, 10, "#0000ff"),
      await solid(10, 10, "#ffffff")
    ];

    node.assign({ tiles, columns: 2 });
    const out = await node.process();
    const meta = await sharp(Buffer.from((out.output as { data: Uint8Array }).data)).metadata();
    expect(meta.width).toBe(20);
    expect(meta.height).toBe(20);
  });

  it("exports CombineImageGridLibNode through the public index", async () => {
    const node = new CombineImageGridLibNode();
    const tiles = [
      await solid(8, 8, "#ff0000"),
      await solid(8, 8, "#00ff00"),
      await solid(8, 8, "#0000ff"),
      await solid(8, 8, "#ffffff")
    ];

    node.assign({ tiles, columns: 2 });
    const out = await node.process();
    const meta = await sharp(Buffer.from((out.output as { data: Uint8Array }).data)).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
  });

  it("errors when combine receives no tiles", async () => {
    const cls = LIB_GRID_NODES.find(
      (n) => n.nodeType === "lib.grid.CombineImageGrid"
    );
    if (!cls) throw new Error("missing CombineImageGrid node");

    const node = new cls();
    node.assign({ tiles: [] });
    await expect(node.process()).rejects.toThrow("No tiles provided");
  });
});
