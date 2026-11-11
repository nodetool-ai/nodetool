import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { GpuFrameCompositor, HeadlessFrameCompositor, type FrameLayerPixels } from "@nodetool-ai/timeline/render";
import type { TimelineSequence } from "@nodetool-ai/timeline";
import { readRgbaFrames, videoStreamFormat, writeRgbaVideo } from "@nodetool-ai/runtime/media/testing";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";
import { encoderSpecFromArgs } from "../src/nodes/timeline/rawFrames.js";

const boundary = vi.hoisted(() => ({ frames: [] as Uint8Array[] }));
vi.mock("@nodetool-ai/runtime/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/runtime/media")>();
  return { ...actual, openVideoFrameEncoder: async (opts: Parameters<typeof actual.openVideoFrameEncoder>[0]) => {
    expect(opts.input).toBe("rgba");
    const encoder = await actual.openVideoFrameEncoder(opts);
    return { ...encoder, write: async (bytes: Uint8Array) => {
      boundary.frames.push(bytes);
      await encoder.write(bytes);
    } };
  } };
});
const width = 64, height = 16;
const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
function difference(a: Uint8Array, b: Uint8Array): { max: number; mean: number } {
  expect(a.length).toBe(b.length);
  let max = 0, sum = 0;
  for (let i = 0; i < a.length; i++) {
    const error = Math.abs(a[i] - b[i]);
    max = Math.max(max, error);
    sum += error;
  }
  return { max, mean: sum / a.length };
}
function sequence(): TimelineSequence {
  return {
    id: "precision", projectId: "test", name: "Precision boundary", width, height,
    fps: 10, durationMs: 200, createdAt: "", updatedAt: "", markers: [],
    tracks: [{ id: "v", name: "Video", type: "video", index: 0, visible: true, locked: false }],
    clips: ["#000000", "#ffffff", "#5984ad", "#102030"].map((fill, i) => ({
      id: `bar-${i}`, trackId: "v", name: fill, startMs: 0, durationMs: 200,
      mediaType: "shape", sourceType: "generated", status: "generated", locked: false,
      versions: [], opacity: i === 2 ? 0.5 : i === 3 ? 0 : 1,
      shapeStyle: { kind: "rect", fill },
      transform: { position: { x: (i - 1.5) * 16, y: 0 }, scale: { x: 0.25, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
      // An inverse exposure pair makes an accidental byte working chain observable.
      effects: [{ id: "down", type: "exposure", enabled: true, exposure: -5 },
        { id: "up", type: "exposure", enabled: true, exposure: 5 }]
    }))
  };
}
it.each(["rgba-alpha", "rgba-opaque", "mp4"] as const)(
  "preserves final delivery bytes through the server encoder: %s", async (delivery) => {
    const device = await getNodeGPUDevice();
    const dir = await mkdtemp(join(tmpdir(), "a40-"));
    const alpha = delivery === "rgba-alpha";
    const output = resolveTimelineOutput({ format: alpha ? "mov" : "mp4", alpha });
    if (delivery !== "mp4") {
      // Lossless diagnostic through the same infrastructure, not a delivery codec.
      output.encoderArgs = ["-c:v", "ffv1", "-pix_fmt", "bgra", "-level", "3"];
      output.extension = "mkv";
    }
    const delivered: Uint8Array[] = [];
    const formats: string[] = [];
    const render = HeadlessFrameCompositor.prototype.renderFrameSamples;
    const composite = GpuFrameCompositor.prototype.composite;
    const renderSpy = vi.spyOn(HeadlessFrameCompositor.prototype, "renderFrameSamples").mockImplementation(async function (this: HeadlessFrameCompositor, ...args) {
      const bytes = await render.apply(this, args);
      delivered.push(bytes);
      return bytes;
    });
    const compositeSpy = vi.spyOn(GpuFrameCompositor.prototype, "composite").mockImplementation(function (this: GpuFrameCompositor<FrameLayerPixels>, ...args) {
      const result = composite.apply(this, args);
      formats.push(result.texture.format);
      return result;
    });
    try {
      const outputs: Uint8Array[][] = [];
      const metrics = [];
      for (const workingFormat of [undefined, "rgba8unorm", "rgba16float"] as const) {
        boundary.frames.length = 0;
        delivered.length = 0;
        formats.length = 0;
        const outPath = join(dir, `${workingFormat ?? "default"}.${output.extension}`);
        const result = await renderTimelineComposited({ sequence: sequence(), width, height,
          fps: 10, durationMs: 200, resolveAssetPath: async () => null,
          outPath, output, workingFormat });
        expect(result.complete).toBe(true);
        const expectedDefaultHash = process.env[alpha ? "A42_EXPECTED_ALPHA_HASH" : "A42_EXPECTED_OPAQUE_HASH"];
        if (workingFormat === undefined && expectedDefaultHash) {
          expect(hash(delivered[0])).toBe(expectedDefaultHash);
        }
        expect(boundary.frames).toHaveLength(2);
        expect(formats).toEqual([workingFormat ?? "rgba8unorm", workingFormat ?? "rgba8unorm"]);
        for (let i = 0; i < 2; i++) {
          expect(boundary.frames[i]).toBe(delivered[i]);
          expect(delivered[i]).toHaveLength(width * height * 4);
        }
        expect(delivered[0]).toEqual(delivered[1]);
        outputs.push(delivered.slice());
        process.stdout.write(JSON.stringify({ delivery, workingFormat: workingFormat ?? "default", hash: hash(delivered[0]) }) + "\n");
        const decoded = await readRgbaFrames(outPath, { width, height });
        expect(decoded).toHaveLength(2);
        const referencePath = join(dir, `reference.${output.extension}`);
        await writeRgbaVideo({ outPath: referencePath, width, height, fps: 10, frames: 2,
          frameAt: (i) => delivered[i], spec: encoderSpecFromArgs(output.encoderArgs) });
        const reference = await readRgbaFrames(referencePath, { width, height });
        expect(decoded).toEqual(reference);
        if (delivery !== "mp4") expect(decoded).toEqual(delivered);
        else expect(await videoStreamFormat(outPath)).toMatchObject({ codec: "h264",
          pixelFormat: "yuv420p", colorSpace: "bt709", colorPrimaries: "bt709",
          colorTransfer: "bt709", colorRange: "tv" });
        metrics.push({ workingFormat: workingFormat ?? "default", hash: hash(delivered[0]),
          codecError: difference(decoded[0], delivered[0]), referenceError: difference(decoded[0], reference[0]) });
      }
      expect(outputs[0]).toEqual(outputs[1]);
      expect(difference(outputs[1][0], outputs[2][0]).max).toBeGreaterThan(0);
      const float = outputs[2][0];
      const at = (x: number): number[] => [...float.slice((8 * width + x) * 4, (8 * width + x) * 4 + 4)];
      expect(at(56)).toEqual(alpha ? [0, 0, 0, 0] : [0, 0, 0, 255]);
      expect(at(8)).toEqual([0, 0, 0, 255]);
      // FP16 storage and final Bayer dither allow one code at white.
      expect(at(24)[3]).toBe(255);
      for (const channel of at(24).slice(0, 3)) expect(channel).toBeGreaterThanOrEqual(254);
      const partial = at(40);
      // Half coverage is 127.5 codes. Either nearest byte is valid.
      expect(Math.abs(partial[3] - (alpha ? 127.5 : 255))).toBeLessThanOrEqual(alpha ? 0.5 : 0);
      expect(Math.abs(partial[0] - (alpha ? 89 : 45))).toBeLessThanOrEqual(1);
      process.stdout.write(JSON.stringify({ delivery, adapter: { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device, description: device.adapterInfo.description }, metrics,
        byteVsFloat: difference(outputs[1][0], float), partial }) + "\n");
    } finally {
      renderSpy.mockRestore();
      compositeSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000
);
