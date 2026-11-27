/**
 * The blockout path with no editor open: build a set from primitives and a
 * figure, place it on a timeline with a free camera, key the camera, apply
 * move presets, and look at the result in clay.
 *
 * The edits go through the headless `ui_timeline_*` tools, the same ones
 * `edit_timeline` dispatches to. The first describe mocks the renderer and
 * checks what it is asked for: the pass, and the camera the keyed moves give
 * at each timecode. The second runs the real headless Chromium and checks the
 * pixels, under the gate `timeline-model3d-frames.test.ts` uses.
 */

import { existsSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOperations,
  createModel3DFile,
  listScene,
  parseOperation,
  serializeModel3D
} from "@nodetool-ai/model3d";
import type { TimelineSequence } from "@nodetool-ai/timeline";
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

import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";
import { composeContactSheet } from "../src/timeline-preview/sheet.js";

const W = 320;
const H = 180;
const BACKGROUND = [24, 24, 24];
const SET_ASSET = "asset_set";

/** A floor, a crate and one cast figure, in meters with the ground at y = 0. */
function buildSet(): Uint8Array {
  const file = createModel3DFile("Kitchen");
  applyOperations(
    file,
    [
      { op: "add_object", kind: "plane", name: "floor" },
      { op: "set_transform", target: "floor", scale: [3, 3, 1] },
      { op: "add_object", kind: "box", name: "counter", position: [1.5, 0.45, 0] },
      { op: "set_transform", target: "counter", scale: [1.2, 0.9, 0.6] },
      {
        op: "add_object",
        kind: "figure",
        name: "ana",
        body: "female",
        pose: "stand",
        position: [0, 0, 0],
        entityId: "entity_ana",
        label: "Ana"
      }
    ].map(parseOperation)
  );
  const figure = listScene(file.json).find((object) => object.name === "ana");
  expect(figure).toMatchObject({
    type: "Figure",
    figure: { body: "female", pose: "stand", entityId: "entity_ana", label: "Ana" }
  });
  return serializeModel3D(file);
}

type Bridge = ReturnType<typeof createTimelineToolBridge>;

async function call(
  bridge: Bridge,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = bridge.tools.find((entry) => entry.name === name);
  expect(tool, `${name} is registered`).toBeDefined();
  return (await tool!.execute(args)) as Record<string, unknown>;
}

/**
 * Block one shot: the set framed from eye height with a 35 mm lens, a push in
 * over the first two seconds and an orbit over the last two.
 */
async function blockShot(): Promise<TimelineSequence> {
  const bridge = createTimelineToolBridge({
    sequence: {
      fps: 24,
      width: 1920,
      height: 1080,
      tracks: [
        { id: "track-v", name: "Video", type: "video", index: 0, visible: true, locked: false }
      ],
      clips: []
    }
  });
  const added = await call(bridge, "ui_timeline_add_model3d_clip", {
    assetId: SET_ASSET,
    trackId: "track-v",
    startMs: 0,
    durationMs: 4000,
    style: {
      camera: {
        mode: "free",
        position: [0, 1.6, 5],
        target: [0, 1, 0],
        focalLengthMm: 35
      },
      background: { transparent: false, color: "#181818" }
    }
  });
  expect(added).toMatchObject({ ok: true });
  const target = (added.clip as { id: string }).id;

  const keyed = await call(bridge, "ui_timeline_set_model3d_style", {
    target,
    patch: {},
    keyAtMs: 0
  });
  expect(keyed).toMatchObject({
    ok: true,
    cameraKeyTimesMs: [0],
    camera: { position: [0, 1.6, 5], focalLengthMm: 35 }
  });

  const pushed = await call(bridge, "ui_timeline_apply_model3d_camera_move", {
    target,
    move: "pushIn",
    amount: 0.5,
    startMs: 0,
    durationMs: 2000
  });
  expect(pushed).toMatchObject({
    ok: true,
    endMs: 2000,
    to: { position: [0, 1.3, 2.5] }
  });

  const orbited = await call(bridge, "ui_timeline_apply_model3d_camera_move", {
    target,
    move: "orbit",
    amount: 45,
    startMs: 2000
  });
  expect(orbited).toMatchObject({ ok: true, startMs: 2000, endMs: 4000 });

  const state = bridge.finalState();
  return {
    id: "seq-blockout",
    projectId: "proj-1",
    name: "Blockout",
    fps: 24,
    width: 1920,
    height: 1080,
    durationMs: 4000,
    tracks: state.documentTracks,
    clips: state.documentClips,
    markers: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}

function solidPng(color: string): Uint8Array {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

describe("blockout path, what the renderer is asked for", () => {
  beforeEach(() => {
    renderFrames.mockReset();
    renderFrames.mockImplementation(async (_glb, _options, requested) =>
      requested.map(() => solidPng("#8c8c8c"))
    );
  });

  it("draws the keyed free camera in clay at each timecode", async () => {
    const sequence = await blockShot();
    const glb = buildSet();
    const result = await renderTimelineFrames({
      sequence,
      timesMs: [0, 2000, 4000 - 1],
      width: W,
      pass: "clay",
      loadAsset: async (assetId) => (assetId === SET_ASSET ? glb : null)
    });

    expect(result.complete).toBe(true);
    expect(result.frames).toHaveLength(3);
    const requested = renderFrames.mock.calls.flatMap(([, , frames]) => frames);
    expect(requested).toHaveLength(3);
    expect(requested.every((frame) => frame.pass === "clay")).toBe(true);
    expect(requested.every((frame) => frame.camera.mode === "free")).toBe(true);

    const [start, afterPush, afterOrbit] = requested.map(
      (frame) => frame.camera.position!
    );
    expect(start).toEqual([0, 1.6, 5]);
    // Half the way to the target at [0, 1, 0].
    expect(afterPush[0]).toBeCloseTo(0, 6);
    expect(afterPush[1]).toBeCloseTo(1.3, 6);
    expect(afterPush[2]).toBeCloseTo(2.5, 6);
    // The orbit keeps the height and the distance and moves to +X.
    expect(afterOrbit[0]).toBeGreaterThan(1.5);
    expect(afterOrbit[1]).toBeCloseTo(1.3, 3);
    expect(Math.hypot(afterOrbit[0], afterOrbit[2])).toBeCloseTo(2.5, 2);
    // 35 mm on a 24 mm tall sensor.
    expect(requested[0]!.camera.fovDeg).toBeCloseTo(37.85, 2);

    for (const frame of result.frames) {
      expect(frame.layers[0]).toMatchObject({
        kind: "model3d",
        pass: "clay",
        camera: { mode: "free" }
      });
    }
  });
});

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

/**
 * How many pixels are drawn geometry, how many of those are not grey, and how
 * many drawn pixels sit on the middle row. The camera aims at the figure's
 * waist and the ray through it passes over the far edge of the floor, so the
 * middle row holds the figure and nothing else.
 */
async function coverage(
  png: Uint8Array
): Promise<{ drawn: number; colored: number; middleRow: number }> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  let drawn = 0;
  let colored = 0;
  let middleRow = 0;
  const middle = Math.floor(image.height / 2);
  for (let at = 0; at < data.length; at += 4) {
    const isBackground = BACKGROUND.every(
      (value, channel) => Math.abs(data[at + channel]! - value) <= 3
    );
    if (isBackground) continue;
    drawn += 1;
    if (Math.floor(at / 4 / image.width) === middle) middleRow += 1;
    const spread =
      Math.max(data[at]!, data[at + 1]!, data[at + 2]!) -
      Math.min(data[at]!, data[at + 1]!, data[at + 2]!);
    if (spread > 6) colored += 1;
  }
  return { drawn, colored, middleRow };
}

describe.skipIf(!chromePath)("blockout path, real headless render", () => {
  it("renders the set in grey and the push in brings the figure closer", async () => {
    process.env.CHROME_PATH = chromePath!;
    const actual = await vi.importActual<
      typeof import("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless")
    >("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless");
    renderFrames.mockReset();
    renderFrames.mockImplementation(actual.renderGlbFramesHeadless);

    const sequence = await blockShot();
    const glb = buildSet();
    const result = await renderTimelineFrames({
      sequence,
      timesMs: [0, 2000],
      width: W,
      pass: "clay",
      loadAsset: async (assetId) => (assetId === SET_ASSET ? glb : null)
    });
    expect(result.complete).toBe(true);
    expect(result.frames.map((frame) => frame.degraded)).toEqual([[], []]);

    const wide = await coverage(result.frames[0]!.png);
    const close = await coverage(result.frames[1]!.png);
    // The set is on screen, and every surface is the clay grey.
    expect(wide.drawn).toBeGreaterThan(W * H * 0.05);
    expect(wide.colored).toBe(0);
    expect(close.colored).toBe(0);
    // Half the distance: the figure is about twice as wide in the picture.
    expect(wide.middleRow).toBeGreaterThan(3);
    expect(close.middleRow).toBeGreaterThan(wide.middleRow * 1.6);
    expect(close.middleRow).toBeLessThan(wide.middleRow * 2.6);

    const sheet = await composeContactSheet(
      result.frames.map((frame) => ({ label: `${frame.time_ms}ms`, png: frame.png }))
    );
    expect(sheet.cells).toBe(2);
  }, 180_000);
});
