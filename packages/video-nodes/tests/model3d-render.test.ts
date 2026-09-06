/**
 * Tests for `nodetool.model3d.RenderToImage` (issue #3532).
 *
 * The camera math and platform tagging are always tested. The headless
 * Chromium integration renders a real GLB to PNG and is skipped when no
 * Chrome/Chromium binary can be found (CHROME_PATH or well-known locations),
 * so CI environments without a browser still pass.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  computeFraming,
  mixerTimeFor,
  orbitOffset,
  selectAnimationClips,
  selectSceneCamera,
  type Model3DRenderFrame,
  type Model3DSessionOptions
} from "../src/nodes/model3d/render3d-core.js";
import { renderGlbFramesHeadless } from "../src/nodes/model3d/render3d-headless.js";
import { RenderToImageNode } from "../src/nodes/model3d/render.js";

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
  glb.fill(0x20, offset + jsonBytes.byteLength, offset + jsonBytes.byteLength + jsonPad);
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
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      buffers: [{ byteLength: bin.byteLength }]
    },
    bin
  );
}

/**
 * A GLB with the same triangle and two named animations that translate it in
 * different directions over 2 s, so the same time renders differently under
 * each name. Built by hand because the repo ships no animated GLB fixture.
 */
function createAnimatedGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const times = new Float32Array([0, 2]);
  const slide = new Float32Array([0, 0, 0, 0.4, 0, 0]);
  const rise = new Float32Array([0, 0, 0, 0, 0.4, 0]);

  const bin = new Uint8Array(
    positions.byteLength + times.byteLength + slide.byteLength + rise.byteLength
  );
  let at = 0;
  const offsets: number[] = [];
  for (const part of [positions, times, slide, rise]) {
    offsets.push(at);
    bin.set(new Uint8Array(part.buffer), at);
    at += part.byteLength;
  }

  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "tri" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0]
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 2,
        type: "SCALAR",
        min: [0],
        max: [2]
      },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC3" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: times.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: slide.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: rise.byteLength }
    ],
    buffers: [{ byteLength: bin.byteLength }],
    animations: [
      {
        name: "slide",
        samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      },
      {
        name: "rise",
        samplers: [{ input: 1, output: 3, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      }
    ]
  };

  return packGlb(json, bin);
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
    // macOS: without these the headless render silently skips on every dev
    // machine, so a break here only ever surfaces on CI.
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

describe("RenderToImage camera math", () => {
  it("fits the bounding sphere for the limiting axis", () => {
    // Square aspect: vertical fov limits.
    const square = computeFraming(1, 60, 1, 1);
    expect(square.distance).toBeCloseTo(1 / Math.sin(Math.PI / 6), 5);
    // Tall aspect (< 1): horizontal fov is narrower and limits instead.
    const tall = computeFraming(1, 60, 0.5, 1);
    expect(tall.distance).toBeGreaterThan(square.distance);
    // Zoom moves closer.
    const zoomed = computeFraming(1, 60, 1, 2);
    expect(zoomed.distance).toBeCloseTo(square.distance / 2, 5);
    expect(square.near).toBeGreaterThan(0);
    expect(square.far).toBeGreaterThan(square.distance);
  });

  it("orbits on a sphere of the requested radius", () => {
    const front = orbitOffset(0, 0, 10);
    expect(front.x).toBeCloseTo(0, 5);
    expect(front.y).toBeCloseTo(0, 5);
    expect(front.z).toBeCloseTo(10, 5);

    const side = orbitOffset(90, 0, 10);
    expect(side.x).toBeCloseTo(10, 5);
    expect(side.z).toBeCloseTo(0, 5);

    const raised = orbitOffset(45, 30, 10);
    const length = Math.hypot(raised.x, raised.y, raised.z);
    expect(length).toBeCloseTo(10, 5);
    expect(raised.y).toBeCloseTo(5, 5);
  });

  it("clamps extreme elevation instead of flipping", () => {
    const top = orbitOffset(0, 90, 10);
    expect(top.y).toBeLessThan(10);
    expect(top.y).toBeGreaterThan(9.9);
  });
});

describe("RenderToImage node metadata", () => {
  it("runs on node and browser platforms", () => {
    expect(RenderToImageNode.platforms).toContain("node");
    expect(RenderToImageNode.platforms).toContain("browser");
  });

  it("rejects non-glTF formats with a pointer to the converter", async () => {
    const node = new RenderToImageNode();
    node.model = { type: "model_3d", format: "stl", data: "AAAA" };
    await expect(node.process()).rejects.toThrow(/glb\/gltf/i);
  });

  it("rejects an empty model input", async () => {
    const node = new RenderToImageNode();
    node.model = { type: "model_3d", uri: "", data: null };
    await expect(node.process()).rejects.toThrow(/empty/i);
  });
});

describe("mixerTimeFor", () => {
  it("starts at zero", () => {
    expect(mixerTimeFor(0, 2, true)).toBe(0);
    expect(mixerTimeFor(0, 2, false)).toBe(0);
  });

  it("wraps past the end when looping", () => {
    expect(mixerTimeFor(5, 2, true)).toBeCloseTo(1, 10);
    expect(mixerTimeFor(2.5, 2, true)).toBeCloseTo(0.5, 10);
    // A negative time (a reversed remap that ran past the start) wraps too.
    expect(mixerTimeFor(-0.5, 2, true)).toBeCloseTo(1.5, 10);
  });

  it("clamps past the end when not looping", () => {
    expect(mixerTimeFor(5, 2, false)).toBe(2);
    expect(mixerTimeFor(-1, 2, false)).toBe(0);
  });

  it("splits at exactly the duration", () => {
    // Looping starts the next cycle; holding stays on the last frame.
    expect(mixerTimeFor(2, 2, true)).toBe(0);
    expect(mixerTimeFor(2, 2, false)).toBe(2);
  });

  it("maps every time to zero for a model with no animation", () => {
    expect(mixerTimeFor(3, 0, true)).toBe(0);
    expect(mixerTimeFor(3, 0, false)).toBe(0);
  });
});

describe("session selection", () => {
  const clips = [{ name: "slide" }, { name: "rise" }];
  const cameras = [{ name: "hero" }, { name: "top" }];

  it("plays every animation when no name is given", () => {
    expect(selectAnimationClips(clips)).toEqual(clips);
    expect(selectAnimationClips(clips, "rise")).toEqual([{ name: "rise" }]);
  });

  it("names the available animations for an unknown clip", () => {
    expect(() => selectAnimationClips(clips, "spin")).toThrow(
      /available animations: slide, rise/
    );
    expect(() => selectAnimationClips([], "spin")).toThrow(/no animations/);
  });

  it("takes the first glTF camera when no name is given", () => {
    expect(selectSceneCamera(cameras)).toEqual({ name: "hero" });
    expect(selectSceneCamera(cameras, "top")).toEqual({ name: "top" });
  });

  it("names the available cameras for an unknown scene camera", () => {
    expect(() => selectSceneCamera(cameras, "drone")).toThrow(
      /available cameras: hero, top/
    );
    expect(() => selectSceneCamera([], "drone")).toThrow(/no cameras/);
  });
});

const chromePath = findChrome();

describe.skipIf(!chromePath)("RenderToImage headless render", () => {
  it("renders a GLB to a PNG of the requested size", async () => {
    process.env.CHROME_PATH = chromePath!;
    const node = new RenderToImageNode();
    node.model = {
      type: "model_3d",
      format: "glb",
      data: Buffer.from(createTriangleGlb()).toString("base64")
    };
    node.width = 320;
    node.height = 240;
    node.transparent = false;
    node.background_color = "#102030";

    const result = await node.process();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("image");

    const png = new Uint8Array(Buffer.from(output.data, "base64"));
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(pngSize(png)).toEqual({ width: 320, height: 240 });
    // A real render of a lit triangle on a colored background is never a
    // near-empty PNG.
    expect(png.byteLength).toBeGreaterThan(500);
  }, 120_000);
});

function sessionOptions(
  animation: Model3DSessionOptions["animation"]
): Model3DSessionOptions {
  return {
    lighting: "flat",
    lightIntensity: 1,
    background: { transparent: false, color: "#102030" },
    animation
  };
}

function frameAt(timeSec: number): Model3DRenderFrame {
  return {
    timeSec,
    width: 160,
    height: 120,
    camera: {
      mode: "orbit",
      azimuthDeg: 0,
      elevationDeg: 0,
      fovDeg: 35,
      zoom: 1
    }
  };
}

function samePng(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}

describe.skipIf(!chromePath)("Model3D render session, headless", () => {
  const glb = createAnimatedGlb();

  it("draws a different picture for each named animation at the same time", async () => {
    process.env.CHROME_PATH = chromePath!;
    const [slide] = await renderGlbFramesHeadless(
      glb,
      sessionOptions({ clipName: "slide", loop: true, speed: 1 }),
      [frameAt(1)]
    );
    const [rise] = await renderGlbFramesHeadless(
      glb,
      sessionOptions({ clipName: "rise", loop: true, speed: 1 }),
      [frameAt(1)]
    );
    expect([...slide.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(samePng(slide, rise)).toBe(false);
  }, 180_000);

  it("holds the last frame past the end when loop is off", async () => {
    process.env.CHROME_PATH = chromePath!;
    // The clip is 2 s long: 3 s is 1.5x its duration.
    const [past, last, middle] = await renderGlbFramesHeadless(
      glb,
      sessionOptions({ clipName: "slide", loop: false, speed: 1 }),
      [frameAt(3), frameAt(2), frameAt(1)]
    );
    expect(samePng(past, last)).toBe(true);
    expect(samePng(past, middle)).toBe(false);
  }, 180_000);

  it("renders a time the same whatever was rendered before it", async () => {
    process.env.CHROME_PATH = chromePath!;
    // t = 5 wraps to 1 s; the two t = 0.2 frames bracket it, so an equal pair
    // can only come from an absolute `setTime`.
    const [first, wrapped, again] = await renderGlbFramesHeadless(
      glb,
      sessionOptions({ clipName: "slide", loop: true, speed: 1 }),
      [frameAt(0.2), frameAt(5), frameAt(0.2)]
    );
    expect(samePng(first, again)).toBe(true);
    expect(samePng(first, wrapped)).toBe(false);
  }, 180_000);
});
