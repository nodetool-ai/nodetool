/**
 * The headless-Chromium render (`renderTimelineInBrowser`), for real.
 *
 * The first half needs no browser: which encodings the driver asks the page
 * for, and the VP9 → H.264 transcode that serves an mp4 when the browser has
 * no H.264 encoder (Chromium builds without proprietary codecs). The second
 * half launches a browser and renders: the containers come out as asked, a
 * cancel stops the work within 5 s, and the picture matches the Node
 * compositor's (`renderTimelineComposited`) at ten timestamps.
 *
 * The browser half steps aside, and says why, when no Chromium launches —
 * set `CHROME_PATH` to a Chromium or install Playwright's. The parity case
 * also needs the Node compositor's WebGPU device.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineSequence } from "@nodetool-ai/timeline";

import {
  generateMedia,
  inspectMedia,
  readRgbaFrames,
  videoStreamFormat
} from "@nodetool-ai/runtime/media/testing";
import {
  BrowserRenderUnavailableError,
  encodingsFor,
  renderTimelineInBrowser,
  transcodeIntermediate
} from "../src/nodes/timeline/browserRender.js";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 10;
let directory = "";
let clipPath = "";

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-browser-render-"));
  // A variable-frame-rate source, like the generated clips that made the
  // Node path slow: 60/1 nominal, about 24 fps on average. Tagged BT.709 as
  // those clips are. Untagged, Chrome reads H.264 as BT.709 and libav as
  // BT.601, and the two renders differ by the matrix, not the compositor.
  clipPath = path.join(directory, "vfr.mp4");
  await generateMedia({
    outPath: clipPath,
    video: {
      source: `testsrc2=size=${WIDTH}x${HEIGHT}:rate=60:duration=4`,
      filter: "select='lt(mod(n\\,5)\\,2)'",
      options: { preset: "ultrafast", colorspace: "bt709", color_primaries: "bt709", color_trc: "bt709" }
    }
  });
});

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});


describe("encodingsFor", () => {
  it("asks for H.264 first for a default mp4, then VP9 and AV1 to transcode", () => {
    expect(encodingsFor(resolveTimelineOutput({ format: "mp4" }))).toEqual([
      { kind: "video", container: "mp4", codec: "avc" },
      { kind: "video", container: "webm", codec: "vp9", intermediate: true },
      { kind: "video", container: "mp4", codec: "av1", intermediate: true },
      { kind: "png" }
    ]);
  });

  it("transcodes an mp4 whose encoder the browser does not have", () => {
    const encodings = encodingsFor(resolveTimelineOutput({ format: "mp4", videoCodec: "libx265" }));
    expect(encodings[0]).toEqual({ kind: "video", container: "webm", codec: "vp9", intermediate: true });
  });

  it("encodes webm in the browser and falls back to frames", () => {
    expect(encodingsFor(resolveTimelineOutput({ format: "webm" }))).toEqual([
      { kind: "video", container: "webm", codec: "vp9" },
      { kind: "png" }
    ]);
  });

  it("sends frames for ProRes and PNG sequences", () => {
    expect(encodingsFor(resolveTimelineOutput({ format: "mov", alpha: true }))).toEqual([{ kind: "png" }]);
    expect(encodingsFor(resolveTimelineOutput({ format: "png_sequence" }))).toEqual([{ kind: "png" }]);
  });
});

describe("transcodeIntermediate", () => {
  it("turns a VP9 intermediate into the H.264 mp4 that was asked for", async () => {
    const webm = path.join(directory, "intermediate.webm");
    await generateMedia({
      outPath: webm,
      video: {
        source: `testsrc2=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=2`,
        codec: "libvpx-vp9",
        options: { deadline: "realtime" }
      }
    });
    const mp4 = path.join(directory, "transcoded.mp4");
    await transcodeIntermediate(webm, mp4, resolveTimelineOutput({ format: "mp4" }));

    expect(await videoStreamFormat(mp4)).toMatchObject({
      codec: "h264",
      pixelFormat: "yuv420p",
      colorSpace: "bt709"
    });
    expect((await inspectMedia(mp4)).frameTimes).toHaveLength(2 * FPS);
  }, 60_000);
});

function fixture(durationMs: number): TimelineSequence {
  return {
    id: "seq-browser",
    name: "Browser render",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs,
    tracks: [
      { id: "t-title", type: "overlay", index: 0, visible: true },
      { id: "t-card", type: "overlay", index: 1, visible: true },
      { id: "t-video", type: "video", index: 2, visible: true }
    ],
    clips: [
      {
        id: "clip-title",
        trackId: "t-title",
        name: "Title",
        startMs: 0,
        durationMs,
        mediaType: "text",
        sourceType: "generated",
        textStyle: { text: "Parity", fontSizePx: 40, color: "#ffffff" }
      },
      {
        id: "clip-card",
        trackId: "t-card",
        name: "Card",
        startMs: 0,
        durationMs,
        mediaType: "shape",
        sourceType: "generated",
        opacity: 0.6,
        shapeStyle: { kind: "rect", fill: "#1e3a8a", x: 0.1, y: 0.55, width: 0.8, height: 0.35 }
      },
      {
        id: "clip-video",
        trackId: "t-video",
        name: "Generated",
        startMs: 0,
        durationMs,
        mediaType: "video",
        sourceType: "generated",
        status: "generated",
        currentAssetId: "vfr"
      }
    ]
  } as TimelineSequence;
}

const resolveAssetPath = async (id: string): Promise<string | null> => (id === "vfr" ? clipPath : null);

function browserRender(
  format: string,
  durationMs: number,
  extra: { signal?: AbortSignal; onProgress?: (frame: number, total: number) => void } = {}
) {
  const output = resolveTimelineOutput({ format });
  return renderTimelineInBrowser({
    sequence: fixture(durationMs),
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs,
    output,
    bitrate: 0,
    resolveAssetPath,
    outPath: path.join(directory, `browser-${format}-${durationMs}.${output.extension}`),
    workDir: directory,
    ...extra
  });
}

/** Rendered once at module load; null when a browser launched. */
const noBrowserReason = await (async (): Promise<string | null> => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-browser-probe-"));
  try {
    await renderTimelineInBrowser({
      sequence: { id: "probe", name: "probe", width: 16, height: 16, fps: 1, durationMs: 1000, tracks: [], clips: [] } as TimelineSequence,
      width: 16,
      height: 16,
      fps: 1,
      durationMs: 1000,
      output: resolveTimelineOutput({ format: "png_sequence" }),
      bitrate: 0,
      resolveAssetPath: async () => null,
      outPath: path.join(scratch, "probe.zip"),
      workDir: scratch
    });
    return null;
  } catch (error) {
    if (!(error instanceof BrowserRenderUnavailableError)) throw error;
    process.stderr.write(`timeline-browser-render: skipping the browser cases — ${error.message}\n`);
    return error.message;
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
})();

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`timeline-browser-render: skipping parity — no WebGPU device for the Node compositor. ${reason}\n`);
    return reason;
  }
})();

describe.runIf(!noBrowserReason)("renderTimelineInBrowser", () => {
  it("renders an H.264 mp4 with every frame", async () => {
    const result = await browserRender("mp4", 2000);
    const file = path.join(directory, "browser-mp4-2000.mp4");
    expect((await videoStreamFormat(file))?.codec).toBe("h264");
    const report = await inspectMedia(file);
    expect(report.video?.width).toBe(WIDTH);
    expect(report.frameTimes).toHaveLength(2 * FPS);
    expect(result.frames).toBe(2 * FPS);
    process.stderr.write(
      `browser render: ${result.browser}, ${result.backend} (${result.adapter ?? result.webgpuUnusable ?? "no adapter"}), ` +
        `${result.encoding.kind === "png" ? "png" : result.encoding.codec}, transcoded=${result.transcoded}\n`
    );
  }, 120_000);

  it("renders a webm with alpha through PNG frames", async () => {
    const output = resolveTimelineOutput({ format: "webm", alpha: true });
    const outPath = path.join(directory, "alpha.webm");
    await renderTimelineInBrowser({
      sequence: fixture(1000),
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      durationMs: 1000,
      output,
      bitrate: 0,
      resolveAssetPath,
      outPath,
      workDir: directory
    });
    const format = await videoStreamFormat(outPath);
    expect(format?.codec).toBe("vp9");
    const tags = Object.fromEntries(
      Object.entries(format?.tags ?? {}).map(([key, value]) => [key.toLowerCase(), value])
    );
    expect(tags["alpha_mode"]).toBe("1");
  }, 120_000);

  it("renders a PNG sequence", async () => {
    const result = await browserRender("png_sequence", 1000);
    expect(result.encoding).toEqual({ kind: "png" });
    const zip = await fs.stat(path.join(directory, "browser-png_sequence-1000.zip"));
    expect(zip.size).toBeGreaterThan(0);
  }, 120_000);

  it("stops within 5 s of a cancel", async () => {
    const controller = new AbortController();
    let cancelledAt = 0;
    const started = browserRender("mp4", 60_000, {
      signal: controller.signal,
      onProgress: (frame) => {
        if (frame === 5 && !cancelledAt) {
          cancelledAt = Date.now();
          controller.abort();
        }
      }
    });
    await expect(started).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelledAt).toBeGreaterThan(0);
    expect(Date.now() - cancelledAt).toBeLessThan(5000);
  }, 120_000);

  it.runIf(!noAdapterReason)("matches the Node compositor at ten timestamps", async () => {
    const durationMs = 3000;
    // PNG frames on both sides, so the comparison is the compositors' and not
    // two lossy encoders'.
    const browserOut = path.join(directory, "parity-browser.zip");
    const nodeOut = path.join(directory, "parity-node.zip");
    const output = resolveTimelineOutput({ format: "png_sequence" });
    const browser = await renderTimelineInBrowser({
      sequence: fixture(durationMs),
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      durationMs,
      output,
      bitrate: 0,
      resolveAssetPath,
      outPath: browserOut,
      workDir: directory
    });
    await renderTimelineComposited({
      sequence: fixture(durationMs),
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      durationMs,
      resolveAssetPath,
      outPath: nodeOut,
      output
    });
    const frames = Array.from({ length: 10 }, (_, i) => Math.round((i * (durationMs / 1000) * FPS) / 10) + 1);
    const diffs: number[] = [];
    for (const frame of frames) {
      const [a, b] = await Promise.all([frameRgb(browserOut, frame), frameRgb(nodeOut, frame)]);
      diffs.push(meanDiff(a, b));
    }
    process.stderr.write(`parity, mean diff per frame: ${diffs.map((d) => d.toFixed(4)).join(" ")}\n`);
    // The bar: a mean difference of at most 0.02 over the ten frames. What is
    // left is not the compositor's: the browser and libav decoders round
    // differently at the hard edges of the test pattern, and Chromium and
    // Skia set the title's glyphs about a pixel apart. No single frame may
    // stray far from that.
    const mean = diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;
    // The CI log is not always at hand, so the failure carries what ran.
    const ran =
      `browser ${browser.browser}, ${browser.backend}` +
      `${browser.webgpuUnusable ? ` (${browser.webgpuUnusable})` : ""}, ` +
      `${browser.convertedSources} source(s) converted; per-frame diffs ` +
      diffs.map((d) => d.toFixed(4)).join(" ");
    expect(mean, ran).toBeLessThanOrEqual(0.02);
    for (const diff of diffs) expect(diff, ran).toBeLessThanOrEqual(0.03);
  }, 180_000);
});

/** Frame `index` (0-based) of a PNG-sequence zip as RGB bytes. */
async function frameRgb(zip: string, index: number): Promise<Buffer> {
  const png = path.join(directory, `frame-${path.basename(zip)}-${index}.png`);
  await fs.writeFile(png, storedZipEntry(await fs.readFile(zip), `frame_${String(index + 1).padStart(6, "0")}.png`));
  const size = await pngSize(png);
  const [rgba] = await readRgbaFrames(png, size);
  if (!rgba) throw new Error(`${png} decoded to no picture`);
  const rgb = Buffer.alloc((rgba.length / 4) * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    rgb[o] = rgba[i]!;
    rgb[o + 1] = rgba[i + 1]!;
    rgb[o + 2] = rgba[i + 2]!;
  }
  return rgb;
}

/** A PNG file's size, from its IHDR chunk. */
async function pngSize(file: string): Promise<{ width: number; height: number }> {
  const header = await fs.readFile(file);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/** One entry of a store-only zip, the kind `pngSequence.ts` writes. */
function storedZipEntry(zip: Buffer, name: string): Buffer {
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const dataStart = offset + 30 + nameLength + zip.readUInt16LE(offset + 28);
    if (zip.toString("utf8", offset + 30, offset + 30 + nameLength) === name) {
      return zip.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + size;
  }
  throw new Error(`${name} is not in the zip`);
}

/** Mean absolute difference, 0 to 1. */
function meanDiff(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  expect(a.length).toBeGreaterThan(0);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / a.length / 255;
}
