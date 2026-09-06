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

  it("degrades to model3d_unavailable when the renderer will not launch", async () => {
    renderFrames.mockRejectedValue(
      new Error("could not find a Chrome installation")
    );

    const { frames } = await framesOf([model3dClip({ id: "cube" })], [1000]);

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
