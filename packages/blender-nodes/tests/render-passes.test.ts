/**
 * T4: `render_passes` through the real Blender, one assertion per output.
 *
 * Skipped when Blender is absent, the way `model3d-render.test.ts` skips
 * without Chrome. The depth range is asserted against numbers computed
 * from the fixture geometry — not against whatever the code returns (see
 * `expectedDepthRange`): two quads at known view-axis depths from an
 * axis-aligned orbit camera, so every foreground pixel on one quad shares
 * one depth and the range is `(distance - 0.5, distance + 0.5)`.
 */

import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BlenderOp, RenderPassesParams } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { runBlenderJob } from "../src/run-job.js";
import { blenderAvailable, failWhenBlenderRequired } from "./blender-available.js";

failWhenBlenderRequired();
import { blenderTestContext, type BlenderTestContext } from "./context.js";
import { createDepthGlb, createTriangleGlb } from "./fixtures.js";
import { decodePng, hasPngSignature, topColorFraction } from "./png.js";

function passesOp(
  passes: string[],
  overrides: Record<string, unknown> = {}
): BlenderOp {
  return {
    op: "render_passes",
    params: {
      camera_mode: "orbit",
      azimuth: 0,
      elevation: 0,
      fov: 35,
      zoom: 1,
      lighting: "studio",
      light_intensity: 1,
      background_color: "#102030",
      transparent: false,
      engine: "eevee",
      samples: 16,
      denoise: true,
      resolution_percentage: 100,
      width: 160,
      height: 120,
      passes,
      depth_format: "png16",
      ...overrides
    } as unknown as RenderPassesParams
  };
}

function outputsFor(passes: string[]): Record<string, string> {
  const outputs: Record<string, string> = {};
  if (passes.includes("color")) outputs["color"] = "color.png";
  if (passes.includes("depth")) outputs["depth"] = "depth.png";
  if (passes.includes("normal")) outputs["normal"] = "normal.png";
  if (passes.includes("mask")) outputs["mask"] = "mask.png";
  return outputs;
}

/**
 * The documented auto-framing distance (`framing.py`, pinned by T3) for a
 * bounding sphere of `radius` — reimplemented here from the spec, not
 * imported from the code under test.
 */
function framingDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  zoom: number
): number {
  const v = (Math.max(fovDeg, 1) * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * Math.max(aspect, 1e-6));
  const safe = Math.max(radius, 1e-6);
  return Math.max(safe / Math.sin(v / 2), safe / Math.sin(h / 2)) / Math.max(zoom, 1e-3);
}

/**
 * Expected `(near, far)` for the depth fixture at 160x120, fov 35, zoom 1:
 * bounds radius 1.5 around (0.5, 0.5, 0.5), front quad half a unit nearer
 * than the center along the view axis, back quad half a unit farther.
 */
function expectedDepthRange(): { near: number; far: number } {
  const distance = framingDistance(1.5, 35, 160 / 120, 1);
  return { near: distance - 0.5, far: distance + 0.5 };
}

function cornerSamples(
  samples: ArrayLike<number>,
  width: number,
  height: number,
  channels: number
): number[][] {
  const at = (x: number, y: number): number[] => {
    const base = (y * width + x) * channels;
    return [samples[base]!, samples[base + 1]!, samples[base + 2]!];
  };
  return [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1)
  ];
}

/**
 * Expected 8-bit camera-space normal for the triangle fixture at the given
 * orbit angles, derived from the fixture geometry — not copied from a
 * render. The triangle lies in the glTF z=0 plane, so its world normal is
 * +glTF-Z, which the importer maps onto Blender -Y (see `buildGlb`). The
 * camera-space components are the dot products of that world normal with
 * the orbit camera's basis vectors in world space — `-sin(az)` on X,
 * `-sin(el) * cos(az)` on Y, `cos(el) * cos(az)` on Z — mapped from
 * `[-1, 1]` to `[0, 255]` exactly like `_map_normal` in `render_passes.py`.
 */
function expectedTiltedNormal(
  azimuthDeg: number,
  elevationDeg: number
): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const components = [
    -Math.sin(az),
    -Math.sin(el) * Math.cos(az),
    Math.cos(el) * Math.cos(az)
  ];
  return components.map((component) =>
    Math.round(Math.min(1, Math.max(0, component * 0.5 + 0.5)) * 255)
  ) as [number, number, number];
}

/** Base offsets of foreground pixels whose 4-neighbors are also foreground. */
function interiorForeground(
  mask: ArrayLike<number>,
  width: number,
  height: number
): number[] {
  const at = (x: number, y: number): number => mask[y * width + x]!;
  const bases: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (
        at(x, y) === 255 &&
        at(x - 1, y) === 255 &&
        at(x + 1, y) === 255 &&
        at(x, y - 1) === 255 &&
        at(x, y + 1) === 255
      ) {
        bases.push((y * width + x) * 3);
      }
    }
  }
  return bases;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe.skipIf(!blenderAvailable())("render_passes integration", () => {
  let helper: BlenderTestContext | null = null;

  beforeEach(() => {
    helper = blenderTestContext();
  });

  afterEach(() => {
    helper?.cleanup();
    helper = null;
  });

  it("renders color, depth, normal, and mask honoring every D4 contract", async () => {
    const passes = ["color", "depth", "normal", "mask"];
    const result = await runBlenderJob(
      helper!.context,
      createDepthGlb(),
      passesOp(passes),
      outputsFor(passes),
      { timeoutMs: 300_000 }
    );
    expect(result.stats.camera).toBe("NodeTool_Orbit");

    // color: decodes at the requested size and is not uniform.
    const color = decodePng(result.outputs["color"]!);
    expect(hasPngSignature(result.outputs["color"]!)).toBe(true);
    expect(color.width).toBe(160);
    expect(color.height).toBe(120);
    expect(topColorFraction(color)).toBeLessThan(0.99);

    // mask: strictly binary with a foreground present.
    const mask = decodePng(result.outputs["mask"]!);
    expect(mask.channels).toBe(1);
    const maskValues = new Set(mask.pixels);
    expect([...maskValues].sort((a, b) => a - b)).toEqual([0, 255]);
    const foreground = mask.pixels.filter((v) => v === 255).length;
    expect(foreground).toBeGreaterThan(0);
    expect(foreground).toBeLessThan(mask.pixels.length);

    // normal: background pixels are exactly (128, 128, 255).
    const normal = decodePng(result.outputs["normal"]!);
    expect(normal.channels).toBe(3);
    for (const corner of cornerSamples(normal.pixels, 160, 120, 3)) {
      expect(corner).toEqual([128, 128, 255]);
    }
    // The front quad faces the camera, so its pixels went through the
    // world-to-camera rotation and land back near +Z — proving the map ran
    // on real normals instead of filling a constant.
    const centerBase = (60 * 160 + 80) * 3;
    const centerNormal = [
      normal.pixels[centerBase]!,
      normal.pixels[centerBase + 1]!,
      normal.pixels[centerBase + 2]!
    ];
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(centerNormal[c]! - [128, 128, 255][c]!)).toBeLessThanOrEqual(2);
    }

    // depth: 16-bit gray, background 65535, range matches the fixture.
    const depth = decodePng(result.outputs["depth"]!);
    expect(depth.channels).toBe(1);
    expect(depth.samples16).toBeDefined();
    const samples = depth.samples16!;
    for (const [x, y] of [[0, 0], [159, 0], [0, 119], [159, 119]]) {
      expect(samples[y! * 160 + x!]).toBe(65535);
    }
    const expected = expectedDepthRange();
    expect(result.stats.depth_near).toBeDefined();
    expect(result.stats.depth_far).toBeDefined();
    expect(Math.abs(result.stats.depth_near! - expected.near)).toBeLessThan(0.05);
    expect(Math.abs(result.stats.depth_far! - expected.far)).toBeLessThan(0.05);
    expect(result.stats.depth_near!).toBeLessThan(result.stats.depth_far!);
    // The frame-center ray hits the front quad at the near depth, which
    // normalizes to 0.
    expect(samples[60 * 160 + 80]).toBeLessThanOrEqual(2);
  }, 300_000);

  it("masks from the object index pass on Cycles", async () => {
    // The index socket exists only on Cycles (measured 5.2.1: EEVEE lists
    // Image/Alpha/Depth with the flag on), so the mask stages a third
    // pass there instead of sharing the depth resolve. The contract is the
    // same binary image: background corners 0, foreground present.
    const passes = ["mask"];
    const result = await runBlenderJob(
      helper!.context,
      createDepthGlb(),
      passesOp(passes, { engine: "cycles" }),
      outputsFor(passes),
      { timeoutMs: 300_000 }
    );
    const mask = decodePng(result.outputs["mask"]!);
    expect(mask.channels).toBe(1);
    expect(mask.width).toBe(160);
    expect(mask.height).toBe(120);
    expect([...new Set(mask.pixels)].sort((a, b) => a - b)).toEqual([0, 255]);
    for (const [x, y] of [[0, 0], [159, 0], [0, 119], [159, 119]]) {
      expect(mask.pixels[y! * 160 + x!]).toBe(0);
    }
    const foreground = mask.pixels.filter((v) => v === 255).length;
    expect(foreground).toBeGreaterThan(0);
    expect(foreground).toBeLessThan(mask.pixels.length);
  }, 300_000);

  it("maps a tilted triangle's normals to its camera-space direction", async () => {
    // The depth fixture faces the camera, so its foreground normals equal
    // the background constant by construction. The triangle at an oblique
    // angle proves the map emits the actual camera-space direction: the
    // interior foreground median must land near the value derived from the
    // fixture geometry below, which no constant fill can satisfy.
    const azimuth = 45;
    const elevation = 25;
    const passes = ["normal", "mask"];
    const result = await runBlenderJob(
      helper!.context,
      createTriangleGlb(),
      passesOp(passes, { azimuth, elevation }),
      outputsFor(passes),
      { timeoutMs: 300_000 }
    );
    const normal = decodePng(result.outputs["normal"]!);
    for (const corner of cornerSamples(normal.pixels, 160, 120, 3)) {
      expect(corner).toEqual([128, 128, 255]);
    }
    const mask = decodePng(result.outputs["mask"]!);
    expect(new Set(mask.pixels)).toEqual(new Set([0, 255]));
    const interior = interiorForeground(mask.pixels, 160, 120);
    expect(interior.length).toBeGreaterThan(0);
    const expected = expectedTiltedNormal(azimuth, elevation);
    for (let channel = 0; channel < 3; channel++) {
      const values = interior.map(
        (base) => normal.pixels[base + channel]!
      );
      expect(Math.abs(median(values) - expected[channel]!)).toBeLessThanOrEqual(3);
    }
  }, 300_000);

  it("a killed passes run leaves nothing outside the workdir", async () => {
    // Cycles at full resolution under a 6 s timeout: SIGTERM, then SIGKILL
    // through a Python `finally` that never runs. The old `/tmp` staging
    // left `nodetool-passes-<pid>` behind with two full-resolution float
    // EXRs; staging inside the workdir dies with it instead.
    const stageNames = (dir: string): string[] => {
      try {
        return readdirSync(dir).filter((name) =>
          name.startsWith("nodetool-passes-")
        );
      } catch {
        return [];
      }
    };
    // The old code hardcoded `/tmp`, which is not `os.tmpdir()` on every
    // platform: watch both.
    const dirs = [tmpdir(), "/tmp"];
    const before = dirs.map(stageNames);
    const passes = ["color", "depth", "normal", "mask"];
    const err = await runBlenderJob(
      helper!.context,
      createDepthGlb(),
      passesOp(passes, {
        engine: "cycles",
        samples: 128,
        width: 2048,
        height: 2048
      }),
      outputsFor(passes),
      { timeoutMs: 6000 }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("timeout");
    for (const [index, dir] of dirs.entries()) {
      expect(stageNames(dir)).toEqual(before[index]);
    }
  }, 120_000);

  it("writes raw float EXR depth with the same range", async () => {
    const passes = ["depth"];
    const result = await runBlenderJob(
      helper!.context,
      createDepthGlb(),
      passesOp(passes, { depth_format: "exr" }),
      { depth: "depth.exr" },
      { timeoutMs: 300_000 }
    );
    const exr = result.outputs["depth"]!;
    expect(exr[0]).toBe(0x76);
    expect(exr[1]).toBe(0x2f);
    expect(exr[2]).toBe(0x31);
    expect(exr[3]).toBe(0x01);
    const expected = expectedDepthRange();
    expect(Math.abs(result.stats.depth_near! - expected.near)).toBeLessThan(0.05);
    expect(Math.abs(result.stats.depth_far! - expected.far)).toBeLessThan(0.05);
  }, 300_000);
});
