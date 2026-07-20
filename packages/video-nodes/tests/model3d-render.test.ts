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
  orbitOffset
} from "../src/nodes/model3d/render3d-core.js";
import { RenderToImageNode } from "../src/nodes/model3d/render.js";

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

/** Minimal single-triangle GLB (embedded buffer, no indices). */
function createTriangleGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = new Uint8Array(positions.buffer);
  const json = {
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
  };

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

function findChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome"
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
