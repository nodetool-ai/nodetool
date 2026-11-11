import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { FileStorageAdapter, InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { makeClip, makeSequence, makeTrack } from "@nodetool-ai/timeline";
import { readRgbaFrames, writeRgbaVideo } from "@nodetool-ai/runtime/media/testing";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { RenderTimelineNode } from "../src/nodes/timeline.js";
import { AssetFiles } from "../src/nodes/timeline/assetFiles.js";

const id = "0123456789abcdef0123456789abcdef";
const userId = "originals-test";
const track = makeTrack({ id: "v", type: "video", index: 0 });
const seq = makeSequence({ id: "s", name: "Originals", width: 16, height: 16, fps: 10,
  durationMs: 100, tracks: [track], clips: [makeClip({ id: "clip", name: "Original",
    trackId: track.id, startMs: 0, durationMs: 100, mediaType: "video",
    status: "generated", currentAssetId: id.slice(0, 12) })] });

it.each(["node", "browser"])("%s final export uses originals or reports missing media", async (renderer) => {
  const device = await getNodeGPUDevice();
  const dir = await mkdtemp(join(tmpdir(), "a44-"));
  const old = process.env.NODETOOL_TIMELINE_RENDERER;
  process.env.NODETOOL_TIMELINE_RENDERER = renderer;
  const logs: unknown[] = [];
  try {
    const whitePath = join(dir, "white.mp4"), blackPath = join(dir, "black.mp4");
    for (const [file, value] of [[whitePath, 255], [blackPath, 0]] as const) {
      const rgba = new Uint8Array(16 * 16 * 4).fill(value);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      await writeRgbaVideo({ outPath: file, width: 16, height: 16, fps: 10, frames: 1,
        frameAt: () => rgba, spec: { codec: "libx264", pixelFormat: "yuv420p" } });
    }
    const white = await readFile(whitePath), black = await readFile(blackPath);
    for (const local of [true, false]) {
      for (const originalAvailable of [true, false]) {
        const storage = local ? new FileStorageAdapter(join(dir, `${originalAvailable}`)) : new InMemoryStorageAdapter();
        // Proxy first in listing, and the clip uses a 12-character resource ID.
        await storage.store(`${userId}/${id}_proxy.mp4`, black);
        await storage.store(`${userId}/${id}_proxy.json`, new TextEncoder().encode("{}"));
        if (originalAvailable) await storage.store(`${userId}/${id}.mp4`, white);
        const ctx = new ProcessingContext({ jobId: "a44", userId, assetStorage: storage });
        Object.assign(ctx, { createAsset: undefined });
        vi.spyOn(ctx, "postMessage").mockImplementation((msg) => { logs.push(msg); });
        vi.spyOn(ctx, "getTimelineSequence").mockResolvedValue(seq);
        // Keep this test offline. An absent original cannot be rescued by metadata HTTP.
        vi.spyOn(ctx, "httpGet").mockRejectedValue(new Error("offline fixture"));
        const assets = new AssetFiles(dir, ctx);
        const file = await assets.path(id.slice(0, 12));
        if (originalAvailable) expect(await readFile(file!)).toEqual(white);
        else expect(file).toBeNull();
        const node = new RenderTimelineNode();
        Object.assign(node, { timeline: { type: "timeline", id: "s" }, format: "mp4", include_audio: false, __node_id: "a44" });
        if (!originalAvailable) {
          await expect(node.process(ctx)).rejects.toThrow(renderer === "node"
            ? "Timeline export is incomplete: clip (0–100ms): Media asset has no readable file"
            : `Timeline export is incomplete: media asset "${id.slice(0, 12)}" has no readable original. Restore the original media and export again.`);
        } else {
          const result = await node.process(ctx);
          expect(result.output.metadata?.render_mode).toBe(renderer === "node" ? "composited" : "browser");
          const file = join(dir, "out.mp4");
          const data = result.output.data;
          if (typeof data !== "string") { throw new Error("Expected inline render bytes"); }
          await writeFile(file, Buffer.from(data, "base64"));
          const decoded = await readRgbaFrames(file, { width: 16, height: 16 });
          // White original versus black proxy, allowing video quantization at white.
          expect(decoded[0][(8 * 16 + 8) * 4]).toBeGreaterThanOrEqual(254);
          const proxyId = `asset://${id}_proxy.mp4`;
          const proxySequence = { ...seq,
            clips: seq.clips.map((clip) => ({ ...clip, currentAssetId: proxyId })) };
          vi.mocked(ctx.getTimelineSequence).mockResolvedValue(proxySequence);
          await expect(node.process(ctx)).rejects.toThrow(renderer === "node"
            ? "Timeline export is incomplete: clip (0–100ms): Media asset has no readable file"
            : `Timeline export is incomplete: media asset "${proxyId}" has no readable original. Restore the original media and export again.`);
        }
      }
    }
    process.stdout.write(JSON.stringify({ renderer, logs, adapter: { vendor: device.adapterInfo.vendor,
      device: device.adapterInfo.device, description: device.adapterInfo.description } }) + "\n");
  } finally {
    if (old === undefined) delete process.env.NODETOOL_TIMELINE_RENDERER;
    else process.env.NODETOOL_TIMELINE_RENDERER = old;
    vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true });
  }
}, 120000);
