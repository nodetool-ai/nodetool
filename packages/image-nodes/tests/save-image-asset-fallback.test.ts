/**
 * `SaveImageNode` persists through the context's asset interface, and writes a
 * file when the host wired none.
 *
 * The guard used to read `typeof context.createAsset === "function"`, which is
 * true on every context — `createAsset` is a prototype method whether or not
 * the interface behind it exists. So the filesystem fallback below it was
 * unreachable and a host without asset persistence (`nodetool debug`, an app
 * build) threw "model interface 'createAsset' is not configured" instead.
 */

import { describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ProcessingContext, createLocalWorkspace } from "@nodetool-ai/runtime";
import { SaveImageNode } from "../src/nodes/image.js";

async function testImage(): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } }
  })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "", width: 4, height: 4 };
}

describe("SaveImageNode", () => {
  it("writes a file when the context has no asset interface", async () => {
    const dir = await mkdtemp(join(tmpdir(), "save-image-fallback-"));
    try {
      const context = new ProcessingContext({ jobId: "j1", userId: "u1" });
      const node = new SaveImageNode();
      node.assign({ image: await testImage(), folder: dir, filename: "out.png", save_to_workspace: false });

      const result = await node.process(context);

      const output = result.output as Record<string, unknown>;
      expect(String(output.uri)).toMatch(/^file:\/\//);
      const path = String(output.uri).slice("file://".length);
      expect((await readFile(path)).length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists through the interface when the host wired one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "save-image-asset-"));
    try {
      const createAsset = vi.fn(async () => ({ id: "asset-1" }));
      const context = new ProcessingContext({
        jobId: "j2",
        userId: "u1",
        workspace: createLocalWorkspace(dir)
      });
      context.setModelInterfaces({ createAsset });
      const node = new SaveImageNode();
      node.assign({ image: await testImage(), filename: "out.png" });

      const result = await node.process(context);

      const output = result.output as Record<string, unknown>;
      expect(output.uri).toBe("asset://asset-1");
      expect(output.asset_id).toBe("asset-1");
      expect(result.path).toBe(join(dir, "out.png"));
      expect(createAsset).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
