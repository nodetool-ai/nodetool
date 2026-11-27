/**
 * The free camera and the render passes of the shared three.js session.
 *
 * The pure cases run everywhere. The headless ones need a Chromium, as
 * `model3d-render.test.ts` does, and check real pixels: where a world point
 * lands under a rolled free camera, and what each pass writes there.
 */

import { existsSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { afterAll, describe, expect, it } from "vitest";
import {
  computeModel3DOrbitFraming,
  model3dFreeCameraBasis,
  model3dOrbitOffset
} from "@nodetool-ai/timeline";

import {
  DEFAULT_FREE_CAMERA_POSITION,
  DEFAULT_FREE_CAMERA_TARGET,
  MODEL3D_RENDER_PASSES,
  computeFraming,
  computeFreeClipPlanes,
  depthRangeFromViewZ,
  orbitOffset,
  type Model3DRenderFrame,
  type Model3DRenderPass,
  type Model3DSessionOptions
} from "../src/nodes/model3d/render3d-core.js";
import {
  closeHeadlessRenderer,
  renderGlbFramesHeadless
} from "../src/nodes/model3d/render3d-headless.js";

afterAll(() => closeHeadlessRenderer());

describe("orbit math parity with @nodetool-ai/timeline", () => {
  it("fits and places the orbit camera the same way in both packages", () => {
    for (const radius of [0.01, 1, 2, 250]) {
      for (const fov of [0.5, 20, 35, 90, 170]) {
        for (const aspect of [9 / 16, 1, 16 / 9]) {
          for (const zoom of [0, 0.5, 1, 3]) {
            const core = computeFraming(radius, fov, aspect, zoom);
            expect(computeModel3DOrbitFraming(radius, fov, aspect, zoom)).toEqual(core);
            for (const azimuth of [-200, 0, 45, 300]) {
              for (const elevation of [-120, -30, 0, 25, 95]) {
                const offset = orbitOffset(azimuth, elevation, core.distance);
                expect(model3dOrbitOffset(azimuth, elevation, core.distance)).toEqual([
                  offset.x,
                  offset.y,
                  offset.z
                ]);
              }
            }
          }
        }
      }
    }
  });
});

describe("free camera clip planes", () => {
  it("wraps the bounds from outside and keeps a usable near plane inside", () => {
    expect(computeFreeClipPlanes(20, 2)).toEqual({ near: 12, far: 28 });
    const inside = computeFreeClipPlanes(0.5, 10);
    expect(inside.far).toBeCloseTo(40.5);
    expect(inside.near).toBeCloseTo(0.0405);
    expect(computeFreeClipPlanes(0, 0).near).toBeGreaterThan(0);
  });

  it("shares the default pose with the timeline package", () => {
    expect([...DEFAULT_FREE_CAMERA_POSITION]).toEqual([0, 1.6, 5]);
    expect([...DEFAULT_FREE_CAMERA_TARGET]).toEqual([0, 1, 0]);
  });
});

describe("depthRangeFromViewZ", () => {
  it("pads the nearest and farthest corner by 2% of the span", () => {
    const range = depthRangeFromViewZ([-2, -4, -3]);
    expect(range?.near).toBeCloseTo(1.96);
    expect(range?.far).toBeCloseTo(4.04);
  });

  it("clamps a near plane behind the camera and refuses a box behind it", () => {
    expect(depthRangeFromViewZ([1, -5])?.near).toBe(1e-3);
    expect(depthRangeFromViewZ([1, 2])).toBeNull();
  });
});

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

/** A single triangle (0,0,0) (1,0,0) (0,1,0), facing +Z, with a red material. */
function createTriangleGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = new Uint8Array(positions.buffer);
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [
        { pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], metallicFactor: 0 } }
      ],
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
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      buffers: [{ byteLength: bin.byteLength }]
    })
  );
  const jsonPad = pad4(json.byteLength);
  const binPad = pad4(bin.byteLength);
  const total = 12 + 8 + json.byteLength + jsonPad + 8 + bin.byteLength + binPad;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.byteLength + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(json, 20);
  glb.fill(0x20, 20 + json.byteLength, 20 + json.byteLength + jsonPad);
  const binAt = 20 + json.byteLength + jsonPad;
  view.setUint32(binAt, bin.byteLength + binPad, true);
  view.setUint32(binAt + 4, 0x004e4942, true);
  glb.set(bin, binAt + 8);
  return glb;
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
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const chromePath = findChrome();

const WIDTH = 200;
const HEIGHT = 160;
const FOV = 40;
const BACKGROUND = [16, 32, 48];

type Vec3 = [number, number, number];
type Rgba = [number, number, number, number];

interface Pose {
  position: Vec3;
  target: Vec3;
  rollDeg: number;
}

const dot = (a: readonly number[], b: readonly number[]): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where a world point lands, by the basis `@nodetool-ai/timeline` defines. */
function project(pose: Pose, point: Vec3): { x: number; y: number; depth: number } {
  const basis = model3dFreeCameraBasis(pose.position, pose.target, pose.rollDeg);
  const rel = [
    point[0] - pose.position[0],
    point[1] - pose.position[1],
    point[2] - pose.position[2]
  ];
  const depth = dot(rel, basis.forward);
  const half = Math.tan((FOV * Math.PI) / 360);
  const ndcX = dot(rel, basis.right) / (depth * half * (WIDTH / HEIGHT));
  const ndcY = dot(rel, basis.up) / (depth * half);
  return {
    x: Math.round(((ndcX + 1) / 2) * WIDTH),
    y: Math.round(((1 - ndcY) / 2) * HEIGHT),
    depth
  };
}

function frame(pose: Pose, pass?: Model3DRenderPass): Model3DRenderFrame {
  return {
    timeSec: 0,
    width: WIDTH,
    height: HEIGHT,
    pass,
    camera: {
      mode: "free",
      // Orbit terms a free camera has to ignore.
      azimuthDeg: 137,
      elevationDeg: 60,
      zoom: 9,
      targetOffset: [5, 5, 5],
      fovDeg: FOV,
      position: pose.position,
      target: pose.target,
      rollDeg: pose.rollDeg
    }
  };
}

function options(
  background: Model3DSessionOptions["background"] = {
    transparent: false,
    color: "#102030"
  }
): Model3DSessionOptions {
  return {
    lighting: "studio",
    lightIntensity: 1,
    background,
    animation: { loop: false, speed: 1 }
  };
}

async function pixels(png: Uint8Array): Promise<(x: number, y: number) => Rgba> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  return (x, y) => {
    const at = (y * image.width + x) * 4;
    return [data[at], data[at + 1], data[at + 2], data[at + 3]];
  };
}

function expectNear(actual: Rgba, expected: number[], tolerance: number): void {
  expected.forEach((value, i) => {
    expect(Math.abs(actual[i] - value), `channel ${i}: ${actual}`).toBeLessThanOrEqual(
      tolerance
    );
  });
}

const isBackground = (pixel: Rgba): boolean =>
  BACKGROUND.every((value, i) => Math.abs(pixel[i] - value) <= 3);

// Inside the triangle, away from its edges, and not mirror images of each
// other across the triangle's own diagonal.
const NEAR_Y_VERTEX: Vec3 = [0.1, 0.8, 0];
const NEAR_X_VERTEX: Vec3 = [0.8, 0.1, 0];
const HEAD_ON: Pose = { position: [0.25, 0.25, 3], target: [0.25, 0.25, 0], rollDeg: 0 };
const OBLIQUE: Pose = { position: [-2, 0.4, 2], target: [0.5, 0.33, 0], rollDeg: 0 };

describe.skipIf(!chromePath)("free camera, headless", () => {
  const glb = createTriangleGlb();

  it("draws from the eye toward the target and ignores the orbit terms", async () => {
    process.env.CHROME_PATH = chromePath!;
    const [png] = await renderGlbFramesHeadless(glb, options(), [frame(HEAD_ON)]);
    const at = await pixels(png);
    for (const point of [NEAR_Y_VERTEX, NEAR_X_VERTEX]) {
      const { x, y } = project(HEAD_ON, point);
      expect(isBackground(at(x, y))).toBe(false);
    }
    // The target is on the triangle and lands in the middle of the picture.
    expect(isBackground(at(WIDTH / 2, HEIGHT / 2))).toBe(false);
    const outside = project(HEAD_ON, [0.8, 0.8, 0]);
    expect(isBackground(at(outside.x, outside.y))).toBe(true);
  }, 180_000);

  it("turns the horizon clockwise for a positive roll", async () => {
    process.env.CHROME_PATH = chromePath!;
    const rolled: Pose = { ...HEAD_ON, rollDeg: 90 };
    const mirrored: Pose = { ...HEAD_ON, rollDeg: -90 };
    const [png] = await renderGlbFramesHeadless(glb, options(), [frame(rolled)]);
    const at = await pixels(png);

    // The vertex that is straight up from the target in the world sits to
    // the right of it in the picture: up has turned clockwise.
    const up = project(rolled, NEAR_Y_VERTEX);
    expect(up.x).toBeGreaterThan(WIDTH / 2 + 20);
    expect(isBackground(at(up.x, up.y))).toBe(false);
    const along = project(rolled, NEAR_X_VERTEX);
    expect(along.y).toBeGreaterThan(HEIGHT / 2 + 20);
    expect(isBackground(at(along.x, along.y))).toBe(false);

    // The opposite sign would put both on the other side, where nothing is.
    for (const point of [NEAR_Y_VERTEX, NEAR_X_VERTEX]) {
      const wrong = project(mirrored, point);
      expect(isBackground(at(wrong.x, wrong.y))).toBe(true);
    }
  }, 180_000);

  it("falls back to the default eye and target", async () => {
    process.env.CHROME_PATH = chromePath!;
    const fallback = frame(HEAD_ON);
    delete fallback.camera.position;
    delete fallback.camera.target;
    delete fallback.camera.rollDeg;
    const explicit = frame({ position: [0, 1.6, 5], target: [0, 1, 0], rollDeg: 0 });
    const [a, b] = await renderGlbFramesHeadless(glb, options(), [fallback, explicit]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  }, 180_000);
});

describe.skipIf(!chromePath)("render passes, headless", () => {
  const glb = createTriangleGlb();

  it("lists the four passes", () => {
    expect(MODEL3D_RENDER_PASSES).toEqual(["beauty", "clay", "depth", "normal"]);
  });

  it("draws beauty by default and one grey for clay", async () => {
    process.env.CHROME_PATH = chromePath!;
    const [plain, beauty, clay, after] = await renderGlbFramesHeadless(glb, options(), [
      frame(HEAD_ON),
      frame(HEAD_ON, "beauty"),
      frame(HEAD_ON, "clay"),
      frame(HEAD_ON)
    ]);
    expect(Buffer.from(plain).equals(Buffer.from(beauty))).toBe(true);
    // A pass leaves nothing behind on the session.
    expect(Buffer.from(plain).equals(Buffer.from(after))).toBe(true);

    const { x, y } = project(HEAD_ON, [0.3, 0.3, 0]);
    const red = (await pixels(beauty))(x, y);
    expect(red[0]).toBeGreaterThan(red[1] + 60);
    const clayAt = await pixels(clay);
    const grey = clayAt(x, y);
    expect(Math.abs(grey[0] - grey[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(grey[1] - grey[2])).toBeLessThanOrEqual(2);
    expect(grey[0]).toBeGreaterThan(30);
    expect(grey[0]).toBeLessThan(245);
    expect(isBackground(clayAt(2, 2))).toBe(true);
  }, 180_000);

  it("writes linear depth with near white, far black and black empty space", async () => {
    process.env.CHROME_PATH = chromePath!;
    const [png] = await renderGlbFramesHeadless(glb, options(), [frame(OBLIQUE, "depth")]);
    const at = await pixels(png);

    const corners: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0]
    ];
    const depths = corners.map((corner) => project(OBLIQUE, corner).depth);
    const range = depthRangeFromViewZ(depths.map((depth) => -depth))!;
    const expectedGrey = (point: Vec3): number =>
      255 * (1 - (project(OBLIQUE, point).depth - range.near) / (range.far - range.near));

    const near: Vec3 = [0.05, 0.3, 0];
    const middle: Vec3 = [0.45, 0.2, 0];
    const far: Vec3 = [0.85, 0.05, 0];
    const greys = [near, middle, far].map((point) => {
      const { x, y } = project(OBLIQUE, point);
      const pixel = at(x, y);
      expect(pixel[0]).toBe(pixel[1]);
      expect(pixel[1]).toBe(pixel[2]);
      expect(Math.abs(pixel[0] - expectedGrey(point))).toBeLessThanOrEqual(6);
      return pixel[0];
    });
    expect(greys[0]).toBeGreaterThan(greys[1]);
    expect(greys[1]).toBeGreaterThan(greys[2]);
    expect(greys[0]).toBeGreaterThan(200);
    expect(greys[2]).toBeLessThan(80);
    expectNear(at(2, 2), [0, 0, 0, 255], 0);
  }, 180_000);

  it("writes view-space normals and a camera-facing empty space", async () => {
    process.env.CHROME_PATH = chromePath!;
    const [png] = await renderGlbFramesHeadless(glb, options(), [frame(OBLIQUE, "normal")]);
    const at = await pixels(png);
    const basis = model3dFreeCameraBasis(OBLIQUE.position, OBLIQUE.target, 0);
    const worldNormal = [0, 0, 1];
    const view = [
      dot(worldNormal, basis.right),
      dot(worldNormal, basis.up),
      -dot(worldNormal, basis.forward)
    ];
    const { x, y } = project(OBLIQUE, [0.3, 0.3, 0]);
    expectNear(at(x, y), view.map((value) => 255 * (value * 0.5 + 0.5)), 3);
    expectNear(at(2, 2), [128, 128, 255, 255], 1);
  }, 180_000);

  it("keeps empty space transparent on a transparent session", async () => {
    process.env.CHROME_PATH = chromePath!;
    const [depth, normal] = await renderGlbFramesHeadless(
      glb,
      options({ transparent: true }),
      [frame(OBLIQUE, "depth"), frame(OBLIQUE, "normal")]
    );
    for (const png of [depth, normal]) {
      const at = await pixels(png);
      expect(at(2, 2)[3]).toBe(0);
      const { x, y } = project(OBLIQUE, [0.3, 0.3, 0]);
      expect(at(x, y)[3]).toBe(255);
    }
  }, 180_000);
});
