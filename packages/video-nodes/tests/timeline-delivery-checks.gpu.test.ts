import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor } from "@nodetool-ai/timeline/render";
import { makeClip, makeSequence, makeTrack } from "@nodetool-ai/timeline";
import { readRgbaFrames, readRgbaFramesWith, videoStreamFormat, writeRgbaVideo } from "@nodetool-ai/runtime/media/testing";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput, TIMELINE_OUTPUT_FORMATS } from "../src/nodes/timeline/outputFormats.js";
import { encoderSpecFromArgs } from "../src/nodes/timeline/rawFrames.js";
const width = 64, height = 16, frames = 4;
function difference(a: readonly Uint8Array[], b: readonly Uint8Array[]) {
  expect(a.length).toBe(b.length);
  let max = 0, sum = 0, count = 0;
  for (let f = 0; f < a.length; f++) {
    expect(a[f].length).toBe(b[f].length);
    for (let i = 0; i < a[f].length; i++) {
      const e = Math.abs(a[f][i] - b[f][i]);
      max = Math.max(max, e); sum += e; count++;
    }
  }
  return { max, mean: sum / count };
}
// Group straight RGB differences by both delivered alpha codes. This keeps
// alpha rounding visible instead of assigning a pixel to only one format.
function differenceByAlpha(fp16: readonly Uint8Array[], rgba8: readonly Uint8Array[]) {
  const groups = new Map<string, { pixels: number; max: number; sum: number; witness: unknown }>();
  for (let f = 0; f < fp16.length; f++) {
    for (let i = 0; i < fp16[f].length; i += 4) {
      const key = `${rgba8[f][i + 3]}/${fp16[f][i + 3]}`;
      const group = groups.get(key) ?? { pixels: 0, max: -1, sum: 0, witness: null };
      group.pixels++;
      for (let channel = 0; channel < 3; channel++) {
        const error = Math.abs(fp16[f][i + channel] - rgba8[f][i + channel]);
        group.sum += error;
        if (error > group.max) {
          group.max = error;
          group.witness = { frame: f, x: (i / 4) % width, y: Math.floor(i / 4 / width),
            channel, rgba8: rgba8[f][i + channel], fp16: fp16[f][i + channel] };
        }
      }
      groups.set(key, group);
    }
  }
  expect([...groups.values()].reduce((sum, group) => sum + group.pixels, 0)).toBe(width * height * frames);
  return [...groups].map(([alphaCodesRGBA8FP16, group]) => ({
    alphaCodesRGBA8FP16, pixels: group.pixels, max: group.max,
    meanRGB: group.sum / (group.pixels * 3), witness: group.witness
  }));
}
function sequence() {
  const track = makeTrack({ id: "v", type: "video", index: 0 });
  return makeSequence({ width, height, fps: 10, durationMs: 400, tracks: [track],
    clips: Array.from({ length: 16 }, (_, i) => {
      const code = (i * 17).toString(16).padStart(2, "0");
      return makeClip({ id: `ramp-${i}`, trackId: "v", name: "Ramp", startMs: 0,
        durationMs: 400, mediaType: "shape", sourceType: "generated", status: "generated",
        shapeStyle: { kind: "rect", fill: `#${code}${code}${code}` },
        opacity: i < 8 ? 1 : 1 / 16, fadeInMs: 300,
        transform: { position: { x: (i - 7.5) * 4, y: 0 }, scale: { x: 1 / 16, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
        effects: [{ id: "down", type: "exposure", enabled: true, exposure: -5 },
          { id: "up", type: "exposure", enabled: true, exposure: 5 }] });
    }) });
}
async function pngFrames(zip: string, dir: string): Promise<string[]> {
  const bytes = await readFile(zip);
  const paths: string[] = [];
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    expect(bytes.readUInt16LE(at + 8)).toBe(0);
    const size = bytes.readUInt32LE(at + 18), nameLen = bytes.readUInt16LE(at + 26);
    const start = at + 30 + nameLen + bytes.readUInt16LE(at + 28);
    const name = bytes.toString("utf8", at + 30, at + 30 + nameLen);
    if (name.endsWith(".png")) {
      const file = join(dir, name);
      await writeFile(file, bytes.subarray(start, start + size)); paths.push(file);
    }
    at = start + size;
  }
  expect(paths).toHaveLength(frames); return paths;
}
const deliveries = TIMELINE_OUTPUT_FORMATS.flatMap((format) =>
  (format === "mp4" ? [false] : [false, true]).map((alpha) => ({ format, alpha })));
it.each(deliveries)("measures real $format alpha=$alpha delivery in RGBA8 and FP16", async ({ format, alpha }) => {
  const device = await getNodeGPUDevice();
  const dir = await mkdtemp(join(tmpdir(), "a412-"));
  const output = resolveTimelineOutput({ format, alpha });
  const inputs: Uint8Array[][] = [];
  const render = HeadlessFrameCompositor.prototype.renderFrameSamples;
  let captured: Uint8Array[] = [];
  const spy = vi.spyOn(HeadlessFrameCompositor.prototype, "renderFrameSamples").mockImplementation(async function (this: HeadlessFrameCompositor, ...args) {
    const bytes = await render.apply(this, args); captured.push(bytes); return bytes;
  });
  try {
    const metrics = [];
    for (const workingFormat of [undefined, "rgba8unorm", "rgba16float"] as const) {
      captured = [];
      const outPath = join(dir, `${workingFormat ?? "default"}.${output.extension}`);
      const result = await renderTimelineComposited({ sequence: sequence(), width, height, fps: 10,
        durationMs: 400, resolveAssetPath: async () => null, outPath, output, workingFormat });
      expect(result.complete).toBe(true); expect(captured).toHaveLength(frames);
      inputs.push(captured.slice());
      expect(captured[0]).not.toEqual(captured[3]);
      let decoded: Uint8Array[], reference: Uint8Array[];
      let tags;
      if (format === "png_sequence") {
        const files = await pngFrames(outPath, dir);
        tags = await videoStreamFormat(files[0]);
        decoded = (await Promise.all(files.map((file) => readRgbaFrames(file, { width, height })))).flat();
        reference = captured;
      } else {
        tags = await videoStreamFormat(outPath);
        const decode = (file: string) => format === "webm"
          ? readRgbaFramesWith(file, "libvpx-vp9", { width, height })
          : readRgbaFrames(file, { width, height });
        decoded = await decode(outPath);
        const refPath = join(dir, `reference.${output.extension}`);
        await writeRgbaVideo({ outPath: refPath, width, height, fps: 10, frames,
          frameAt: (i) => captured[i], spec: encoderSpecFromArgs(output.encoderArgs) });
        reference = await decode(refPath);
        // Identical bytes and encoder settings must give identical decoded pixels.
        expect(decoded).toEqual(reference);
      }
      expect(decoded).toHaveLength(frames); expect(tags).not.toBeNull();
      const alphaAt = (f: Uint8Array) => f[(8 * width + 58) * 4 + 3];
      if (output.alpha) {
        // Permit one code for alpha quantization at 1/16 coverage.
        expect(Math.abs(alphaAt(decoded[3]) - alphaAt(captured[3]))).toBeLessThanOrEqual(1);
        expect(alphaAt(decoded[0])).toBe(0);
      } else expect(alphaAt(decoded[3])).toBe(255);
      let defaultDecoderAlpha;
      if (format === "webm" && alpha) {
        const native = await readRgbaFrames(outPath, { width, height });
        defaultDecoderAlpha = { native: alphaAt(native[3]), libvpx: alphaAt(decoded[3]), input: alphaAt(captured[3]) };
        expect(defaultDecoderAlpha.native).toBe(255);
      }
      metrics.push({ workingFormat: workingFormat ?? "default", tags,
        codecError: difference(decoded, captured), directEncodeError: difference(decoded, reference), defaultDecoderAlpha });
    }
    expect(inputs[0]).toEqual(inputs[1]);
    // The inverse exposure chain must expose working-byte quantization.
    expect(inputs[2]).not.toEqual(inputs[1]);
    process.stdout.write(JSON.stringify({ format, alpha, adapter: { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device, description: device.adapterInfo.description },
      workingPrecisionError: difference(inputs[2], inputs[1]), workingErrorByAlpha: differenceByAlpha(inputs[2], inputs[1]), metrics }) + "\n");
  } finally { spy.mockRestore(); await rm(dir, { recursive: true, force: true }); }
}, 120000);
