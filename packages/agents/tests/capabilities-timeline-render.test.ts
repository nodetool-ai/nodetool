/**
 * `render_timeline` end to end (T22, D12).
 *
 * The capability builds a graph and hands it to the real execution service, so
 * this drives that service in-process: a two-clip sequence, the render node and
 * the Output node in a registry, and the job row read back the way an agent
 * reads it. What it proves is what a mock could not — the run really produced a
 * video, the composited path ran rather than the rough cut, and the
 * picture at a timecode is the clip the document put there.
 *
 * The frame check decodes with Mediabunny rather than asking a model
 * (`understand_video`): the answer is a pixel, and a pixel is checkable.
 *
 * Compositing needs a WebGPU adapter. On headless Linux that means a Vulkan
 * ICD — AGENTS.md § WebGPU on a headless machine; CI installs lavapipe on the
 * `test-packages` leg. Without it the suite skips loudly and says why, because
 * a silently-skipped render test is a render nobody measured.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { setDefaultModelInterfaces } from "@nodetool-ai/runtime";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { RenderTimelineNode } from "@nodetool-ai/video-nodes/nodes/timeline";
import { OutputNode } from "@nodetool-ai/audio-nodes/nodes/output";

import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import {
  buildRenderTimelineGraph,
  renderResult,
  renderTimeline
} from "../src/capabilities/timelines.js";
import { RENDER_TIMELINE_SCHEMA } from "../src/capabilities/timelines.specs.js";
import {
  forEachVideoFrame,
  probeContainer
} from "../src/analysis/media-decode.js";

const WIDTH = 160;
const HEIGHT = 90;
const FPS = 10;
const DURATION_MS = 1000;

/** Probed while vitest collects: `describe.runIf` is decided before any hook. */
const skipReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
  } catch (error) {
    return `no WebGPU device: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
  return null;
})();

if (skipReason) {
  // Straight to stderr: a console.* call during collection is swallowed.
  process.stderr.write(
    `capabilities-timeline-render: SKIPPING EVERY CASE — ${skipReason}\n`
  );
}

/**
 * Two full-frame shape clips laid end to end: red for the first half, blue for
 * the second. A frame read from either half names which clip drew it, so one
 * pixel checks compositing and clip timing at once.
 */
function twoClipDocument(): string {
  const shape = (fill: string) => ({
    kind: "rect" as const,
    fill,
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });
  const clip = (id: string, startMs: number, fill: string) => ({
    id,
    trackId: "t-video",
    name: id,
    startMs,
    durationMs: DURATION_MS / 2,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    locked: false,
    versions: [],
    shapeStyle: shape(fill)
  });
  return JSON.stringify({
    tracks: [
      {
        id: "t-video",
        name: "Video 1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      clip("red-half", 0, "#ff0000"),
      clip("blue-half", DURATION_MS / 2, "#0000ff")
    ],
    markers: []
  });
}

async function makeTimeline(): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: "u1",
    project_id: "default",
    name: "Two clip cut",
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    duration_ms: DURATION_MS,
    document: twoClipDocument()
  });
}

/** Bytes the fake asset store kept, keyed by the id it handed back. */
const storedAssets = new Map<string, Uint8Array>();

/**
 * The persistence a run needs: the timeline the render node reads, and the
 * asset store the Output node writes the finished video into. The same two
 * interfaces `packages/cli-execution/src/local-model-interfaces.ts` wires for a local
 * run, with the store in memory.
 */
function installModelInterfaces(): void {
  let next = 0;
  setDefaultModelInterfaces({
    getTimelineSequence: async ({ userId, id }) => {
      const seq = await TimelineSequence.findById(id);
      if (!seq || seq.user_id !== userId) return null;
      return seq.toTimelineSequence();
    },
    createAsset: async ({ content, contentType, name }) => {
      const id = `asset-${(next += 1)}`;
      storedAssets.set(id, content);
      return { id, name, content_type: contentType };
    }
  });
}

const run = () =>
  createCapabilityRun({
    context: { userId: "u1" } as unknown as ProcessingContext,
    gate: UNGATED,
    nodeRegistry: (() => {
      const registry = new NodeRegistry();
      registry.register(RenderTimelineNode);
      registry.register(OutputNode);
      return registry;
    })()
  });

/** The average channel values of the frame nearest `timeSeconds`. */
async function meanColorAt(
  bytes: Uint8Array,
  timeSeconds: number
): Promise<{ r: number; g: number; b: number }> {
  let r = 0;
  let g = 0;
  let b = 0;
  let pixels = 0;
  const decoded = await forEachVideoFrame(bytes, [timeSeconds], (frame) => {
    for (let i = 0; i < frame.rgba.length; i += 4) {
      r += frame.rgba[i]!;
      g += frame.rgba[i + 1]!;
      b += frame.rgba[i + 2]!;
      pixels += 1;
    }
  });
  expect(decoded).toBe(1);
  return { r: r / pixels, g: g / pixels, b: b / pixels };
}

/** Wait for a detached render to settle, so it does not outlive its case. */
async function drainJob(jobId: string): Promise<void> {
  const { Job } = await import("@nodetool-ai/models");
  const deadline = Date.now() + 240_000;
  for (;;) {
    const job = await Job.find("u1", jobId);
    if (job && job.status !== "running" && job.status !== "queued") return;
    if (Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe.runIf(!skipReason)("render_timeline", () => {
  beforeEach(async () => {
    await initTestDb();
    storedAssets.clear();
    installModelInterfaces();
  });

  afterEach(() => setDefaultModelInterfaces(null));

  it.each([2, 3])("reports unsupported version %s without starting a job or saving", async (workingColorSpaceVersion) => {
    const seq = await makeTimeline();
    seq.document = JSON.stringify({ ...JSON.parse(seq.document), workingColorSpaceVersion });
    await seq.save();
    const saved = seq.document;
    const result = await renderTimeline.impl(run(), { timeline_id: seq.id });
    expect(result).toEqual({ error: `Document workingColorSpaceVersion is ${workingColorSpaceVersion}. This build supports versions up to 1. Open it with a build that supports this value.` });
    expect((await TimelineSequence.findById(seq.id))?.document).toBe(saved);
    expect(storedAssets.size).toBe(0);
  });

  it("renders the cut as a job and hands back the composited asset", async () => {
    const seq = await makeTimeline();
    const result = (await renderTimeline.impl(run(), {
      timeline_id: seq.id,
      wait: true,
      timeout_ms: 240_000
    })) as Record<string, unknown>;

    expect(result["job_error"]).toBeNull();
    expect(result["status"]).toBe("completed");
    // A compositor ran (the headless browser, or the Node fallback where no
    // browser launches), not the rough cut, which ignores everything
    // above.
    expect(["browser", "composited"]).toContain(result["render_mode"]);
    expect(Math.abs((result["duration_ms"] as number) - DURATION_MS)).toBeLessThan(100);

    const assetId = result["asset_id"] as string;
    const bytes = storedAssets.get(assetId);
    expect(bytes, `no bytes stored for ${assetId}`).toBeDefined();

    const info = await probeContainer(bytes!);
    expect(info.video?.width).toBe(WIDTH);
    expect(info.video?.height).toBe(HEIGHT);

    // The middle of each half is the clip the document put there. h.264 in
    // 4:2:0 shifts the exact values, so the check is which channel dominates.
    const firstHalf = await meanColorAt(bytes!, 0.25);
    expect(firstHalf.r).toBeGreaterThan(150);
    expect(firstHalf.b).toBeLessThan(80);

    const secondHalf = await meanColorAt(bytes!, 0.75);
    expect(secondHalf.b).toBeGreaterThan(150);
    expect(secondHalf.r).toBeLessThan(80);
  }, 300_000);

  it("renders a draft at a fraction of the sequence size", async () => {
    const seq = await makeTimeline();
    const result = (await renderTimeline.impl(run(), {
      timeline_id: seq.id,
      preview_scale: 0.5,
      wait: true,
      timeout_ms: 240_000
    })) as Record<string, unknown>;

    expect(result["status"]).toBe("completed");
    const bytes = storedAssets.get(result["asset_id"] as string);
    const info = await probeContainer(bytes!);
    expect(info.video?.width).toBe(WIDTH / 2);
    // 90 * 0.5 = 45, rounded to the even edge an h.264 encoder accepts.
    expect(info.video?.height).toBe(46);
  }, 300_000);

  it("returns a job id without waiting when wait is not asked for", async () => {
    const seq = await makeTimeline();
    const result = (await renderTimeline.impl(run(), {
      timeline_id: seq.id
    })) as Record<string, unknown>;

    expect(result["status"]).toBe("running");
    expect(typeof result["job_id"]).toBe("string");
    expect(String(result["poll"])).toContain("get_job");
    // Nothing settled, so nothing is claimed about the asset.
    expect(result["asset_id"]).toBeUndefined();

    // The render is detached and outlives this case; let it settle before the
    // next `initTestDb` moves the database out from under it.
    await drainJob(String(result["job_id"]));
  }, 300_000);

  it("reports a timeline that is not the caller's as missing", async () => {
    const seq = await makeTimeline();
    seq.user_id = "someone-else";
    await seq.save();
    const result = (await renderTimeline.impl(run(), {
      timeline_id: seq.id
    })) as Record<string, unknown>;
    expect(String(result["error"])).toContain("was not found");
  });
});

/**
 * The graph and the read-back, without a GPU. These run everywhere, so the
 * suite still measures something on a host that skips the render itself.
 */
describe("render_timeline graph and read-back", () => {
  it("passes every render option through to the render node", () => {
    const graph = buildRenderTimelineGraph("tl-1", {
      timeline_id: "tl-1",
      format: "webm",
      alpha: true,
      video_codec: "libvpx-vp9",
      bitrate: "8M",
      motion_blur_samples: 8,
      shutter_angle: 180,
      preview_scale: 0.5,
      include_audio: false,
      // Not node props: how long the caller waits is the capability's own.
      wait: true,
      timeout_ms: 1000
    });
    const [render, output] = graph.nodes;
    expect(render!["type"]).toBe("nodetool.timeline.RenderTimeline");
    expect(render!["data"]).toEqual({
      timeline: { type: "timeline", id: "tl-1", data: null },
      format: "webm",
      alpha: true,
      video_codec: "libvpx-vp9",
      // The node takes bits per second; "8M" is what a caller writes.
      bitrate: 8_000_000,
      motion_blur_samples: 8,
      shutter_angle: 180,
      preview_scale: 0.5,
      include_audio: false
    });
    // The sink is what turns the rendered bytes into an addressable asset.
    expect(output!["type"]).toBe("nodetool.output.Output");
    expect(graph.edges).toHaveLength(1);
  });

  it("parses a bitrate suffix, and passes a number through", () => {
    const dataFor = (bitrate: unknown) =>
      buildRenderTimelineGraph("tl-1", { bitrate }).nodes[0]!["data"] as Record<
        string,
        unknown
      >;
    expect(dataFor("800k")["bitrate"]).toBe(800_000);
    expect(dataFor("8M")["bitrate"]).toBe(8_000_000);
    expect(dataFor("6000000")["bitrate"]).toBe(6_000_000);
    expect(dataFor(6_000_000)["bitrate"]).toBe(6_000_000);
    expect(dataFor("fast")["bitrate"]).toBeUndefined();
  });

  it("wires the frames output for a png_sequence", () => {
    const graph = buildRenderTimelineGraph("tl-1", { format: "png_sequence" });
    const handles = graph.edges.map((e) => e["sourceHandle"]);
    expect(handles).toContain("frames");
    expect(graph.nodes.filter((n) => n["type"] === "nodetool.output.Output"))
      .toHaveLength(2);
  });

  it("reads a png_sequence zip off a settled job", () => {
    expect(
      renderResult({
        status: "completed",
        metadata_json: {
          outputs: {
            frames: {
              type: "document",
              asset_id: "asset-zip",
              uri: "asset://asset-zip.zip",
              metadata: { render_mode: "composited", format: "png_sequence" }
            }
          }
        }
      })
    ).toMatchObject({
      status: "completed",
      asset_id: "asset-zip",
      uri: "asset://asset-zip.zip",
      render_mode: "composited"
    });
  });

  it("sets only the timeline when the call names no options", () => {
    const graph = buildRenderTimelineGraph("tl-1", { timeline_id: "tl-1" });
    expect(Object.keys(graph.nodes[0]!["data"] as object)).toEqual(["timeline"]);
  });

  it("reads the asset, the render mode and the duration off a settled job", () => {
    expect(
      renderResult({
        status: "completed",
        metadata_json: {
          outputs: {
            video: [
              {
                type: "video",
                asset_id: "asset-9",
                uri: "asset://asset-9.mp4",
                duration: 2.5,
                metadata: { render_mode: "composited" }
              }
            ]
          }
        }
      })
    ).toEqual({
      status: "completed",
      asset_id: "asset-9",
      uri: "asset://asset-9.mp4",
      render_mode: "composited",
      duration_ms: 2500,
      job_error: null
    });
  });

  it("reports a failed render's error instead of inventing an asset", () => {
    expect(
      renderResult({
        status: "failed",
        error_message: "Timeline has zero duration",
        metadata_json: { outputs: {} }
      })
    ).toMatchObject({
      status: "failed",
      asset_id: null,
      render_mode: null,
      job_error: "Timeline has zero duration"
    });
  });

  it("exposes wav format, audio_bit_depth (16/24/32) and audio_sample_rate (up to 192 kHz) matching RenderTimelineNode", () => {
    const props = RENDER_TIMELINE_SCHEMA.properties as Record<string, Record<string, unknown>>;
    expect(props["audio_bit_depth"]).toBeDefined();
    expect(props["audio_bit_depth"]?.["enum"]).toEqual([16, 24, 32]);
    expect(props["audio_sample_rate"]).toBeDefined();
    expect(props["audio_sample_rate"]?.["enum"]).toEqual([44100, 48000, 88200, 96000, 192000]);

    const graph = buildRenderTimelineGraph("tl-1", {
      timeline_id: "tl-1",
      format: "wav",
      audio_bit_depth: 32,
      audio_sample_rate: 192000
    });
    const nodeData = graph.nodes[0]!["data"] as Record<string, unknown>;
    expect(nodeData).toMatchObject({
      format: "wav",
      audio_bit_depth: 32,
      audio_sample_rate: 192000
    });
    const handles = graph.edges.map((e) => e["sourceHandle"]);
    expect(handles).toContain("audio");
    expect(graph.nodes.filter((n) => n["type"] === "nodetool.output.Output")).toHaveLength(2);

    // Prove the real RenderTimelineNode declares both props in its registered metadata.
    const registry = new NodeRegistry();
    registry.register(RenderTimelineNode);
    const meta = registry.getMetadata("nodetool.timeline.RenderTimeline");
    const propNames = meta?.properties.map((p) => p.name) ?? [];
    expect(propNames).toContain("audio_sample_rate");
    expect(propNames).toContain("audio_bit_depth");
  });
});

/** Parse the RIFF/WAVE fmt and data chunks of an actual exported WAV buffer. */
function parseWavHeader(bytes: Uint8Array): {
  riff: string;
  wave: string;
  audioFormat: number;
  effectiveFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (off: number, len: number) =>
    String.fromCharCode(...bytes.subarray(off, off + len));
  const riff = ascii(0, 4);
  const wave = ascii(8, 4);
  let offset = 12;
  let audioFormat = 0;
  let effectiveFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= bytes.byteLength) {
      audioFormat = view.getUint16(body, true);
      numChannels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      effectiveFormat = audioFormat;
      // WAVE_FORMAT_EXTENSIBLE (0xFFFE) stores PCM (1) or IEEE float (3) in the first two bytes of SubFormat GUID.
      if (audioFormat === 0xfffe && size >= 40 && body + 26 <= bytes.byteLength) {
        effectiveFormat = view.getUint16(body + 24, true);
      }
    } else if (id === "data") {
      dataOffset = body;
      dataSize = size;
    }
    offset = body + size + (size % 2);
  }
  return { riff, wave, audioFormat, effectiveFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataSize };
}

/** Write an IEEE 32-bit float WAV buffer (format tag 3) preserving sub-LSB, >1.0, and non-finite values. */
function encodeFloat32Wav(samples: Float32Array, sampleRate: number, channels: number): Uint8Array {
  const dataSize = samples.length * 4;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (off: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(off + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 4, true);
  view.setUint16(32, channels * 4, true);
  view.setUint16(34, 32, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(44 + i * 4, samples[i]!, true);
  }
  return bytes;
}

/**
 * Real WAV export through `render_timeline` -> `RenderTimelineNode` -> real libav WAV encoder.
 * Runs without WebGPU or headless browser because WAV is audio-only.
 */
describe("render_timeline WAV export (real encoder)", () => {
  let assetStorage: InMemoryStorageAdapter;
  let workspacesDir: string;
  let savedWorkspacesDir: string | undefined;

  beforeEach(async () => {
    await initTestDb();
    storedAssets.clear();
    assetStorage = new InMemoryStorageAdapter();
    workspacesDir = mkdtempSync(join(tmpdir(), "nodetool-render-wav-ws-"));
    savedWorkspacesDir = process.env["NODETOOL_WORKSPACES_DIR"];
    process.env["NODETOOL_WORKSPACES_DIR"] = workspacesDir;
    let next = 0;
    setDefaultModelInterfaces({
      getTimelineSequence: async ({ userId, id }) => {
        const seq = await TimelineSequence.findById(id);
        if (!seq || seq.user_id !== userId) return null;
        return seq.toTimelineSequence();
      },
      createAsset: async ({ content, contentType, name }) => {
        const id = `asset-${(next += 1)}`;
        storedAssets.set(id, content);
        return { id, name, content_type: contentType };
      },
      getAssetInfo: async ({ assetId }) =>
        assetId.startsWith("src-tone-")
          ? { id: assetId, content_type: "audio/wav" }
          : null
    });
  });

  afterEach(() => {
    setDefaultModelInterfaces(null);
    if (savedWorkspacesDir === undefined) delete process.env["NODETOOL_WORKSPACES_DIR"];
    else process.env["NODETOOL_WORKSPACES_DIR"] = savedWorkspacesDir;
    rmSync(workspacesDir, { recursive: true, force: true });
  });

  const wavRun = () =>
    createCapabilityRun({
      context: { userId: "u1" } as unknown as ProcessingContext,
      gate: UNGATED,
      workflowEnvironment: async () => {
        const registry = new NodeRegistry();
        registry.register(RenderTimelineNode);
        registry.register(OutputNode);
        return { registry, assetStorage };
      }
    });

  async function createAudioTimeline(assetId: string, durationMs = 500): Promise<TimelineSequence> {
    return TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "default",
      name: "Audio bounce",
      fps: 30,
      width: 160,
      height: 90,
      duration_ms: durationMs,
      document: JSON.stringify({
        tracks: [
          { id: "t-audio", name: "Audio 1", type: "audio", index: 0, visible: true, locked: false }
        ],
        clips: [
          {
            id: "clip-tone",
            trackId: "t-audio",
            name: "Tone",
            startMs: 0,
            durationMs,
            mediaType: "audio",
            sourceType: "imported",
            status: "generated",
            currentAssetId: assetId,
            locked: false,
            versions: []
          }
        ],
        markers: []
      })
    });
  }

  it.each([
    { bitDepth: 16, sampleRate: 44100, expectedFormat: 1 },
    { bitDepth: 24, sampleRate: 96000, expectedFormat: 1 },
    { bitDepth: 32, sampleRate: 192000, expectedFormat: 3 }
  ])(
    "exports a real $bitDepth-bit WAV at $sampleRate Hz through render_timeline with a valid RIFF header",
    async ({ bitDepth, sampleRate, expectedFormat }) => {
      const { encodeWav, sineSamples } = await import("@nodetool-ai/runtime/media/testing");
      const tone = encodeWav(
        sineSamples({ frequency: 440, sampleRate: 48000, channels: 2, durationSec: 0.5, amplitude: 0.5 }),
        48000,
        2
      );
      await assetStorage.store("u1/src-tone-1.wav", tone, "audio/wav");
      const seq = await createAudioTimeline("src-tone-1", 500);

      const result = (await renderTimeline.impl(wavRun(), {
        timeline_id: seq.id,
        format: "wav",
        audio_bit_depth: bitDepth,
        audio_sample_rate: sampleRate,
        wait: true,
        timeout_ms: 60_000
      })) as Record<string, unknown>;

      expect(result["error"]).toBeUndefined();
      expect(result["job_error"]).toBeNull();
      expect(result["status"]).toBe("completed");
      expect(result["render_mode"]).toBe("audio");
      const assetId = result["asset_id"] as string;
      const bytes = storedAssets.get(assetId);
      expect(bytes, `no WAV bytes stored for ${assetId}`).toBeDefined();

      const hdr = parseWavHeader(bytes!);
      expect(hdr.riff).toBe("RIFF");
      expect(hdr.wave).toBe("WAVE");
      expect(hdr.effectiveFormat).toBe(expectedFormat);
      expect(hdr.numChannels).toBe(2);
      expect(hdr.sampleRate).toBe(sampleRate);
      expect(hdr.bitsPerSample).toBe(bitDepth);
      const expectedBytes = Math.round(sampleRate * 0.5) * 2 * (bitDepth / 8);
      expect(Math.abs(hdr.dataSize - expectedBytes)).toBeLessThan(expectedBytes * 0.05);
    },
    60_000
  );

  it(
    "preserves a sub-LSB 440 Hz sine statistically in 16-bit WAV export via TPDF dither, without dithering 24-bit or float",
    async () => {
      const sampleRate = 48000;
      const durationSec = 0.5;
      const frames = Math.round(sampleRate * durationSec);
      const amplitude = 0.000005; // ~0.164 LSB at 16-bit; rounds to all zeros without dither
      const subLsb = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        const s = amplitude * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
        subLsb[i * 2] = s;
        subLsb[i * 2 + 1] = s;
      }
      await assetStorage.store(
        "u1/src-tone-sublsb.wav",
        encodeFloat32Wav(subLsb, sampleRate, 2),
        "audio/wav"
      );
      const seq = await createAudioTimeline("src-tone-sublsb", 500);

      const res16 = (await renderTimeline.impl(wavRun(), {
        timeline_id: seq.id,
        format: "wav",
        audio_bit_depth: 16,
        audio_sample_rate: sampleRate,
        wait: true,
        timeout_ms: 60_000
      })) as Record<string, unknown>;
      expect(res16["error"]).toBeUndefined();
      expect(res16["job_error"]).toBeNull();
      expect(res16["status"]).toBe("completed");
      const bytes16 = storedAssets.get(res16["asset_id"] as string)!;
      const hdr16 = parseWavHeader(bytes16);
      const view16 = new DataView(bytes16.buffer, bytes16.byteOffset + hdr16.dataOffset, hdr16.dataSize);
      const outFrames = Math.floor(hdr16.dataSize / 4);
      let nonZero = 0;
      let cos440 = 0;
      let sin440 = 0;
      let cos617 = 0;
      let sin617 = 0;
      for (let i = 0; i < outFrames; i++) {
        const s = view16.getInt16(i * 4, true) / 32768;
        if (s !== 0) nonZero += 1;
        const w440 = (2 * Math.PI * 440 * i) / sampleRate;
        const w617 = (2 * Math.PI * 617 * i) / sampleRate;
        cos440 += s * Math.cos(w440);
        sin440 += s * Math.sin(w440);
        cos617 += s * Math.cos(w617);
        sin617 += s * Math.sin(w617);
      }
      const recoveredAmp = (2 / outFrames) * Math.hypot(cos440, sin440);
      const offBinAmp = (2 / outFrames) * Math.hypot(cos617, sin617);
      expect(nonZero).toBeGreaterThan(outFrames * 0.1);
      expect(recoveredAmp).toBeGreaterThan(amplitude * 0.6);
      expect(recoveredAmp).toBeLessThan(amplitude * 1.4);
      expect(recoveredAmp).toBeGreaterThan(offBinAmp * 5);

      // Silence exported as 24-bit and 32-bit float must remain strictly zero (no dither).
      const silence = new Float32Array(Math.round(sampleRate * 0.1) * 2);
      await assetStorage.store(
        "u1/src-tone-silence.wav",
        encodeFloat32Wav(silence, sampleRate, 2),
        "audio/wav"
      );
      const silenceSeq = await createAudioTimeline("src-tone-silence", 100);

      const res24 = (await renderTimeline.impl(wavRun(), {
        timeline_id: silenceSeq.id,
        format: "wav",
        audio_bit_depth: 24,
        audio_sample_rate: sampleRate,
        wait: true,
        timeout_ms: 60_000
      })) as Record<string, unknown>;
      expect(res24["error"]).toBeUndefined();
      expect(res24["job_error"]).toBeNull();
      const bytes24 = storedAssets.get(res24["asset_id"] as string)!;
      const hdr24 = parseWavHeader(bytes24);
      let nonZero24 = 0;
      for (let i = hdr24.dataOffset; i < hdr24.dataOffset + hdr24.dataSize; i++) {
        if (bytes24[i] !== 0) nonZero24 += 1;
      }
      expect(nonZero24).toBe(0);

      const res32 = (await renderTimeline.impl(wavRun(), {
        timeline_id: silenceSeq.id,
        format: "wav",
        audio_bit_depth: 32,
        audio_sample_rate: sampleRate,
        wait: true,
        timeout_ms: 60_000
      })) as Record<string, unknown>;
      expect(res32["error"]).toBeUndefined();
      expect(res32["job_error"]).toBeNull();
      const bytes32 = storedAssets.get(res32["asset_id"] as string)!;
      const hdr32 = parseWavHeader(bytes32);
      const view32 = new DataView(bytes32.buffer, bytes32.byteOffset + hdr32.dataOffset, hdr32.dataSize);
      let nonZero32 = 0;
      for (let i = 0; i < hdr32.dataSize; i += 4) {
        if (view32.getFloat32(i, true) !== 0) nonZero32 += 1;
      }
      expect(nonZero32).toBe(0);
    },
    60_000
  );

  it(
    "sanitizes NaN and ±Infinity to zero in 32-bit float WAV export while preserving finite headroom > 1.0",
    async () => {
      const sampleRate = 48000;
      const frames = Math.round(sampleRate * 0.1);
      const samples = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        const mod = i % 5;
        const val =
          mod === 0
            ? Number.NaN
            : mod === 1
              ? Number.POSITIVE_INFINITY
              : mod === 2
                ? Number.NEGATIVE_INFINITY
                : mod === 3
                  ? 1.5
                  : -1.75;
        samples[i * 2] = val;
        samples[i * 2 + 1] = val;
      }
      await assetStorage.store(
        "u1/src-tone-nonfinite.wav",
        encodeFloat32Wav(samples, sampleRate, 2),
        "audio/wav"
      );
      const seq = await createAudioTimeline("src-tone-nonfinite", 100);

      const result = (await renderTimeline.impl(wavRun(), {
        timeline_id: seq.id,
        format: "wav",
        audio_bit_depth: 32,
        audio_sample_rate: sampleRate,
        wait: true,
        timeout_ms: 60_000
      })) as Record<string, unknown>;
      expect(result["error"]).toBeUndefined();
      expect(result["job_error"]).toBeNull();
      expect(result["status"]).toBe("completed");
      const bytes = storedAssets.get(result["asset_id"] as string)!;
      const hdr = parseWavHeader(bytes);
      expect(hdr.effectiveFormat).toBe(3);
      expect(hdr.bitsPerSample).toBe(32);

      const view = new DataView(bytes.buffer, bytes.byteOffset + hdr.dataOffset, hdr.dataSize);
      const totalSamples = Math.floor(hdr.dataSize / 4);
      expect(totalSamples).toBeGreaterThan(0);
      let nonFiniteCount = 0;
      let zeroCount = 0;
      let maxAbs = 0;
      for (let i = 0; i < totalSamples; i++) {
        const v = view.getFloat32(i * 4, true);
        if (!Number.isFinite(v)) nonFiniteCount += 1;
        if (v === 0) zeroCount += 1;
        maxAbs = Math.max(maxAbs, Math.abs(v));
      }
      expect(nonFiniteCount).toBe(0);
      // 3 of every 5 frames were NaN / +Inf / -Inf and must sanitize to 0.
      expect(zeroCount).toBeGreaterThan(totalSamples * 0.5);
      // Finite headroom above 1.0 (1.5 and -1.75) must survive without clamping.
      expect(maxAbs).toBeGreaterThan(1.5);
    },
    60_000
  );
});
