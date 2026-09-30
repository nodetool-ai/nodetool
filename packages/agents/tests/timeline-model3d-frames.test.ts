/**
 * `model3d` layers on the agent frame path (T5, design §D5 host 2).
 *
 * The headless renderer is mocked, because what is under test is not what
 * three.js draws — `packages/video-nodes/tests/model3d-render.test.ts` covers
 * that — but what this pass asks it for: one call per (glTF, session options)
 * group carrying every instant, the camera it folded, the report beside the
 * pixels, and a renderer that will not launch reported as a degradation rather
 * than thrown. The last describe runs the real Chromium, under the same gate
 * the `RenderToImage` test uses.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL3D_STYLE,
  type ClipModel3DStyle,
  type TimelineClip,
  type TimelineSequence,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import type {
  Model3DRenderFrame,
  Model3DSessionOptions
} from "@nodetool-ai/video-nodes/nodes/model3d/render3d-core";

const { renderFrames } = vi.hoisted(() => ({
  renderFrames:
    vi.fn<
      (
        glb: Uint8Array,
        options: Model3DSessionOptions,
        frames: readonly Model3DRenderFrame[]
      ) => Promise<Uint8Array[]>
    >()
}));

vi.mock("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless", () => ({
  renderGlbFramesHeadless: renderFrames
}));

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const W = 240;
const H = 135;

/** An opaque PNG of one color: what a mocked render hands back. */
function solidPng(width: number, height: number, color: string): Uint8Array {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

/** RGBA at a point of a rendered frame. */
async function pixelAt(
  png: Uint8Array,
  x: number,
  y: number
): Promise<[number, number, number, number]> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0]!, data[1]!, data[2]!, data[3]!];
}

const tracks: TimelineTrack[] = [
  {
    id: "track-0",
    name: "Video",
    type: "video",
    index: 0,
    visible: true,
    locked: false
  },
  {
    id: "track-1",
    name: "Overlay",
    type: "overlay",
    index: 1,
    visible: true,
    locked: false
  }
];

function model3dClip(overrides: {
  id: string;
  trackId?: string;
  assetId?: string;
  style?: Partial<ClipModel3DStyle>;
}): TimelineClip {
  return {
    id: overrides.id,
    trackId: overrides.trackId ?? "track-0",
    name: `Clip ${overrides.id}`,
    startMs: 0,
    durationMs: 4000,
    mediaType: "model3d",
    sourceType: "generated",
    status: "generated",
    currentAssetId: overrides.assetId ?? "asset-cube",
    model3dStyle: { ...DEFAULT_MODEL3D_STYLE, ...overrides.style }
  };
}

function sequenceOf(clips: TimelineClip[]): TimelineSequence {
  return {
    id: "seq-1",
    projectId: "proj-1",
    name: "3D sequence",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 4000,
    tracks,
    clips,
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function framesOf(clips: TimelineClip[], timesMs: number[]) {
  return renderTimelineFrames({
    sequence: sequenceOf(clips),
    timesMs,
    width: W,
    loadAsset: async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46])
  });
}

describe("model3d layers on the agent frame path", () => {
  beforeEach(() => {
    renderFrames.mockReset();
    renderFrames.mockImplementation(async (_glb, _options, requested) =>
      requested.map(() => solidPng(W, H, "#ff0000"))
    );
  });

  it("renders two timecodes of one asset in a single headless call", async () => {
    const { frames } = await framesOf([model3dClip({ id: "cube" })], [0, 2000]);

    expect(renderFrames).toHaveBeenCalledTimes(1);
    const [, , requested] = renderFrames.mock.calls[0]!;
    expect(requested.map((frame) => frame.timeSec)).toEqual([0, 2]);
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.complete)).toBe(true);
    // The decoded PNG actually reached the composite, not just the report.
    expect(await pixelAt(frames[0]!.png, W / 2, H / 2)).toEqual([
      255, 0, 0, 255
    ]);
  });

  it("renders one call per session-options group on the same asset", async () => {
    await framesOf(
      [
        model3dClip({ id: "front" }),
        model3dClip({
          id: "back",
          trackId: "track-1",
          style: { background: { transparent: false, color: "#102030" } }
        })
      ],
      [1000]
    );

    expect(renderFrames).toHaveBeenCalledTimes(2);
    const backgrounds = renderFrames.mock.calls.map(
      ([, options]) => options.background
    );
    expect(backgrounds).toEqual(
      expect.arrayContaining([
        { transparent: true },
        { transparent: false, color: "#102030" }
      ])
    );
    // One model, one pose, two looks: each call still carries its own frame.
    for (const [, , requested] of renderFrames.mock.calls) {
      expect(requested).toHaveLength(1);
    }
  });

  it("reports the layer with the camera it drew and the animation time", async () => {
    const { frames } = await framesOf(
      [
        model3dClip({
          id: "cube",
          style: {
            camera: {
              mode: "orbit",
              azimuthDeg: 45,
              elevationDeg: 25,
              fovDeg: 35,
              zoom: 1
            },
            animation: { loop: true, speed: 2 }
          }
        })
      ],
      [1000]
    );

    const [layer] = frames[0]!.layers;
    expect(layer!.kind).toBe("model3d");
    expect(layer!.skipped).toBeUndefined();
    expect(layer!.camera).toEqual({
      mode: "orbit",
      azimuth_deg: 45,
      elevation_deg: 25,
      fov_deg: 35,
      zoom: 1
    });
    // `animation.speed` is 2, so one second of timeline is two of glTF time.
    expect(layer!.animation_time_sec).toBe(2);
  });

  it.each([
    { label: "disabled", blur: { samplesPerFrame: 1 }, times: [1], angles: [45] },
    { label: "narrower", blur: { samplesPerFrame: 4, shutterAngle: 90 }, times: [1.0010416666666666, 1.003125, 1.0052083333333333, 1.0072916666666667], angles: [45.046875, 45.140625, 45.234375, 45.328125] },
    { label: "matching", blur: { samplesPerFrame: 4, shutterAngle: 180 }, times: [1.0020833333333334, 1.00625, 1.0104166666666667, 1.0145833333333334], angles: [45.09375, 45.28125, 45.46875, 45.65625] }
  ])("uses the same per-clip shutter clock for pre-render and composition when $label", async ({ blur, times, angles }) => {
    const cube = model3dClip({ id: "cube", style: {
      camera: { mode: "orbit", azimuthDeg: 0, elevationDeg: 0, fovDeg: 35, zoom: 1 }
    } });
    cube.motionBlur = blur;
    cube.animations = [{
      id: "camera", role: "in", preset: "custom", durationMs: 2000, easing: "linear",
      custom: { curves: [{ property: "cameraAzimuth", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 90 }] }] }
    }];
    const result = await renderTimelineFrames({
      sequence: sequenceOf([cube]), timesMs: [1000], width: W,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 },
      loadAsset: async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    });
    expect(result.complete).toBe(true);
    expect(result.frames[0]!.failures).toEqual([]);
    expect(result.frames[0]!.layers[0]!.skipped).toBeUndefined();
    expect(await pixelAt(result.frames[0]!.png, W / 2, H / 2)).toEqual([255, 0, 0, 255]);
    const requested = renderFrames.mock.calls.flatMap(([, , frames]) => frames);
    expect(requested).toHaveLength(times.length);
    requested.forEach((frame, index) => {
      expect(frame.timeSec).toBeCloseTo(times[index]!, 10);
      expect(frame.camera?.azimuthDeg).toBeCloseTo(angles[index]!, 10);
    });
  });

  it("samples retimed source motion and beat-anchored camera motion with sequence tempo", async () => {
    const cube = model3dClip({ id: "cube", style: {
      camera: { mode: "orbit", azimuthDeg: 0, elevationDeg: 0, fovDeg: 35, zoom: 1 },
      animation: { loop: true, speed: 2 }
    } });
    cube.inPointMs = 500;
    cube.speedMultiplier = 2;
    cube.motionBlur = { samplesPerFrame: 1 };
    cube.animations = [{
      id: "camera", role: "in", preset: "custom", durationMs: 2000,
      beat: { index: 3, scope: "clip" }, easing: "linear",
      custom: { curves: [{ property: "cameraAzimuth", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 90 }] }] }
    }];
    const sequence = sequenceOf([cube]);
    sequence.tempo = { bpm: 240, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } };
    const result = await renderTimelineFrames({
      sequence, timesMs: [1000], width: W,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 },
      loadAsset: async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    });
    expect(result.complete).toBe(true);
    const requested = renderFrames.mock.calls.flatMap(([, , frames]) => frames);
    expect(requested).toHaveLength(1);
    // Beat 3 at 240 BPM starts at 500ms. At 1000ms the 90-degree ramp is 25% through.
    expect(requested[0]!.camera?.azimuthDeg).toBe(22.5);
    expect(requested[0]!.timeSec).toBe(5);
    expect(result.frames[0]!.layers[0]).toMatchObject({
      camera: { azimuth_deg: 22.5 }, animation_time_sec: 5
    });
    expect(await pixelAt(result.frames[0]!.png, W / 2, H / 2)).toEqual([255, 0, 0, 255]);
  });

  it("uses the per-clip shutter clock for a 3D matte source", async () => {
    const key = model3dClip({ id: "key", trackId: "track-1", style: {
      camera: { mode: "orbit", azimuthDeg: 0, elevationDeg: 0, fovDeg: 35, zoom: 1 }
    } });
    key.motionBlur = { samplesPerFrame: 1 };
    key.animations = [{
      id: "camera", role: "in", preset: "custom", durationMs: 2000, easing: "linear",
      custom: { curves: [{ property: "cameraAzimuth", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 90 }] }] }
    }];
    const picture: TimelineClip = {
      id: "picture", name: "Picture", trackId: "track-0",
      startMs: 0, durationMs: 4000, mediaType: "shape", status: "generated", sourceType: "generated",
      shapeStyle: { kind: "rect", fill: "#ffffff", x: 0, y: 0, width: 1, height: 1 },
      matte: { sourceClipId: "key", mode: "alpha" }
    };
    const result = await renderTimelineFrames({
      sequence: sequenceOf([picture, key]), timesMs: [1000], width: W,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 },
      loadAsset: async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    });
    expect(result.complete).toBe(true);
    expect(result.frames[0]!.layers).toMatchObject([{ clip_id: "picture", matte: { source_clip_id: "key" } }]);
    const requested = renderFrames.mock.calls.flatMap(([, , frames]) => frames);
    expect(requested).toHaveLength(1);
    expect(requested[0]!.camera?.azimuthDeg).toBe(45);
    expect(requested[0]!.timeSec).toBe(1);
    expect(await pixelAt(result.frames[0]!.png, W / 2, H / 2)).toEqual([255, 255, 255, 255]);
  });

  it("returns an explicitly incomplete capability result when Chrome cannot launch", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-model3d-"));
    try {
      await mkdir(join(root, "nodetool-base", "models"), { recursive: true });
      await writeFile(join(root, "nodetool-base", "models", "cube.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
      renderFrames.mockRejectedValue(new Error("could not find a Chrome installation"));
      const context = new ProcessingContext({
        jobId: "incomplete-preview", userId: "u1",
        environment: { NODETOOL_PACKAGE_ASSETS_DIR: root }
      });
      const result = await toolForCapabilityName("preview_timeline_frame").process(context, {
        document: sequenceOf([model3dClip({ id: "cube", assetId: "package://nodetool-base/models/cube.glb" })]),
        times_ms: [1000], width: W
      });
      expect(result).toMatchObject({
        complete: false, visual_output_verified: false,
        frames: [{ complete: false, degradations: [{ clip_id: "cube", reason: "model3d_unavailable" }] }]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("degrades to model3d_unavailable when the renderer will not launch", async () => {
    renderFrames.mockRejectedValue(
      new Error("could not find a Chrome installation")
    );

    const { frames } = await framesOf([model3dClip({ id: "cube" })], [1000]);

    expect(frames[0]!.complete).toBe(false);
    expect(frames[0]!.degraded).toEqual([
      {
        clip_id: "cube",
        clip_name: "Clip cube",
        reason: "model3d_unavailable"
      }
    ]);
    const [layer] = frames[0]!.layers;
    expect(layer!.skipped).toContain("could not find a Chrome installation");
    // The picture is the empty frame the compositor paints when nothing draws
    // — black, not the renderer's red — so the report's degradation is the
    // only place the missing layer shows up.
    expect(await pixelAt(frames[0]!.png, W / 2, H / 2)).toEqual([0, 0, 0, 255]);
  });

  it("deduplicates a renderer degradation while retaining every affected shutter tap", async () => {
    renderFrames.mockRejectedValue(new Error("Chrome launch failed"));
    const cube = model3dClip({ id: "cube" });
    cube.animations = [{ id: "orbit", preset: "orbit", role: "loop", durationMs: 2000 }];
    const result = await renderTimelineFrames({
      sequence: sequenceOf([cube]), timesMs: [1000], width: W,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 },
      loadAsset: async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    });
    const frame = result.frames[0]!;
    expect(frame.complete).toBe(false);
    expect(frame.degraded).toEqual([{ clip_id: "cube", clip_name: "Clip cube", reason: "model3d_unavailable" }]);
    expect(frame.failures.find((failure) => failure.kind === "degraded")).toMatchObject({
      clip_id: "cube", reason: "model3d_unavailable",
      samples: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }]
    });
    expect(renderFrames.mock.calls[0]![2]).toHaveLength(4);
    expect(await pixelAt(frame.png, W / 2, H / 2)).toEqual([0, 0, 0, 255]);
  });
});

// ── The real headless path ──────────────────────────────────────────────────

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

/** Wrap a glTF JSON chunk and its embedded binary buffer as a GLB. */
function packGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = pad4(jsonBytes.byteLength);
  const binPad = pad4(bin.byteLength);
  const total =
    12 + 8 + jsonBytes.byteLength + jsonPad + 8 + bin.byteLength + binPad;

  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  let offset = 0;
  view.setUint32(offset, 0x46546c67, true); // "glTF"
  view.setUint32(offset + 4, 2, true);
  view.setUint32(offset + 8, total, true);
  offset += 12;
  view.setUint32(offset, jsonBytes.byteLength + jsonPad, true);
  view.setUint32(offset + 4, 0x4e4f534a, true); // "JSON"
  offset += 8;
  glb.set(jsonBytes, offset);
  glb.fill(
    0x20,
    offset + jsonBytes.byteLength,
    offset + jsonBytes.byteLength + jsonPad
  );
  offset += jsonBytes.byteLength + jsonPad;
  view.setUint32(offset, bin.byteLength + binPad, true);
  view.setUint32(offset + 4, 0x004e4942, true); // "BIN"
  offset += 8;
  glb.set(bin, offset);
  return glb;
}

/** Minimal single-triangle GLB (embedded buffer, no indices). */
function createTriangleGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = new Uint8Array(positions.buffer);
  return packGlb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0]
        }
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: bin.byteLength, target: 34962 }
      ],
      buffers: [{ byteLength: bin.byteLength }]
    },
    bin
  );
}

function findChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

const chromePath = findChrome();

describe.skipIf(!chromePath)("model3d layers, real headless render", () => {
  it("composites what headless Chromium drew", async () => {
    process.env.CHROME_PATH = chromePath!;
    // Only this suite runs the real renderer; the mock delegates so the whole
    // pass — grouping, camera fold, decode, composite — is the one under test.
    const actual = await vi.importActual<
      typeof import("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless")
    >("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless");
    renderFrames.mockImplementation(actual.renderGlbFramesHeadless);

    const glb = createTriangleGlb();
    const { frames } = await renderTimelineFrames({
      sequence: sequenceOf([
        model3dClip({
          id: "triangle",
          style: {
            lighting: "flat",
            background: { transparent: false, color: "#102030" }
          }
        })
      ]),
      timesMs: [0],
      width: W,
      loadAsset: async () => glb
    });

    expect(frames[0]!.degraded).toEqual([]);
    expect(frames[0]!.layers[0]!.skipped).toBeUndefined();
    // An opaque background means every pixel of the layer is drawn, so the
    // frame is opaque wherever the layer covers it — which is all of it.
    expect((await pixelAt(frames[0]!.png, W / 2, H / 2))[3]).toBe(255);
  }, 180_000);
});
