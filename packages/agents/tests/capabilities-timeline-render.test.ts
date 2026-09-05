/**
 * `render_timeline` end to end (T22, D12).
 *
 * The capability builds a graph and hands it to the real execution service, so
 * this drives that service in-process: a two-clip sequence, the render node and
 * the Output node in a registry, and the job row read back the way an agent
 * reads it. What it proves is what a mock could not — the run really produced a
 * video, the composited path ran rather than the ffmpeg rough cut, and the
 * picture at a timecode is the clip the document put there.
 *
 * The frame check decodes with Mediabunny rather than asking a model
 * (`understand_video`): the answer is a pixel, and a pixel is checkable.
 *
 * Compositing needs a WebGPU adapter. On headless Linux that means a Vulkan
 * ICD — AGENTS.md § WebGPU on a headless machine; CI installs lavapipe and
 * ffmpeg on the `test-packages` leg. Missing either skips the suite loudly and
 * says which, because a silently-skipped render test is a render nobody
 * measured.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { setDefaultModelInterfaces } from "@nodetool-ai/runtime";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { RenderTimelineNode } from "@nodetool-ai/video-nodes/nodes/timeline";
import { OutputNode } from "@nodetool-ai/audio-nodes/nodes/output";

import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import {
  buildRenderTimelineGraph,
  renderResult,
  renderTimeline
} from "../src/capabilities/timelines.js";
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
    await promisify(execFile)("ffmpeg", ["-version"]);
  } catch {
    return "ffmpeg is not installed (apt-get install -y ffmpeg)";
  }
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
 * interfaces `packages/cli/src/local-model-interfaces.ts` wires for a local
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

  it("renders the cut as a job and hands back the composited asset", async () => {
    const seq = await makeTimeline();
    const result = (await renderTimeline.impl(run(), {
      timeline_id: seq.id,
      wait: true,
      timeout_ms: 240_000
    })) as Record<string, unknown>;

    expect(result["job_error"]).toBeNull();
    expect(result["status"]).toBe("completed");
    // The composited path is what proves the picture was rendered rather than
    // the clips concatenated by ffmpeg, which ignores everything above.
    expect(result["render_mode"]).toBe("composited");
    expect(result["duration_ms"]).toBeGreaterThan(500);

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
});
