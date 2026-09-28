import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { prepareGameModelBinding3D } from "../src/preparation3d.js";
import { captureGameFrame3D } from "../src/node3d.js";
import { blockoutFrame, triangleGlb, skinnedGlb } from "./fixtures/game3d.js";

describe("real Chromium 3D capture", () => {
  it("renders placeholder geometry and reports the backend and committed hash", async () => {
    const capture = await captureGameFrame3D(blockoutFrame(), { stateHash: "verified-tick-state" });
    expect(capture.stateHash).toBe("verified-tick-state");
    expect(capture.capabilities).toMatchObject({ backend: "webgl2", minimalRenderSucceeded: true });
    expect(capture.stats.triangles).toBeGreaterThan(0);
    const image = await loadImage(Buffer.from(capture.png));
    const canvas = createCanvas(128, 128); const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(64, 64, 1, 1).data;
    expect(pixels[2]).toBeGreaterThan(pixels[0] ?? 255);
  }, 40_000);
  it("loads a verified closed GLB and rejects an external model dependency", async () => {
    const frame = blockoutFrame();
    const original = frame.entities[0];
    if (!original) { throw new Error("Fixture entity is missing"); }
    frame.entities = [{ entityId: "model", transform: original.transform, previousTransform: original.previousTransform,
      model: { assetId: "model", castShadow: false, receiveShadow: false } }];
    const captured = await captureGameFrame3D(frame, { resolveAsset: async () => triangleGlb() });
    expect(captured.stats.triangles).toBeGreaterThan(0);
    await expect(captureGameFrame3D(frame, { resolveAsset: async () => triangleGlb({ images: [{ uri: "https://outside.invalid/image.png" }] }) })).rejects.toThrow("must be embedded");
  }, 60_000);
  it("renders only the prepared default scene and rejects selectors outside it", async () => {
    const bytes = triangleGlb({ nodes: [{ mesh: 0 }, { mesh: 0, translation: [100, 0, 0] }], scenes: [{ nodes: [0] }, { nodes: [1] }], scene: 0 });
    const prepared = await prepareGameModelBinding3D(bytes, { assetId: "multi-scene" });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) { return; }
    expect(prepared.binding.nodeIds).toEqual(["node:0"]); expect(prepared.binding.bounds.max.x).toBe(1);
    const frame = blockoutFrame(); const pose = frame.entities[0].transform;
    frame.entities = [{ entityId: "model", transform: pose, previousTransform: pose, model: { assetId: "model", nodeId: "node:0", castShadow: false, receiveShadow: false } }];
    const capture = await captureGameFrame3D(frame, { resolveAsset: async () => ({ bytes, digest: prepared.binding.digest }) });
    expect(capture.projectedBounds[0]?.minX).toBeCloseTo(41.8297, 3);
    expect(capture.projectedBounds[0]?.maxX).toBeCloseTo(86.1703, 3);
    frame.entities[0].model.nodeId = "node:1";
    await expect(captureGameFrame3D(frame, { resolveAsset: async () => bytes })).rejects.toThrow("does not exist");
  }, 40_000);
  it("renders independently sampled skeleton instances from one prepared GLB", async () => {
    const frame = blockoutFrame();
    const transform = frame.entities[0]?.transform;
    if (!transform) { throw new Error("Fixture pose is missing"); }
    frame.tick = 30;
    frame.entities = [-1.5, 1.5].map((x, index) => ({ entityId: `skin-${index}`, transform: { ...transform, position: { x, y: 0, z: 0 } },
      previousTransform: { ...transform, position: { x, y: 0, z: 0 } }, model: { assetId: "skin", castShadow: true, receiveShadow: true },
      animation: { clipId: "clip:1", startTick: index === 0 ? 0 : 30, playbackRate: 1, loop: false } }));
    frame.lights = [{ entityId: "sun", transform: { ...transform, position: { x: 0, y: 4, z: 3 }, rotation: [-0.3826834323650898, 0, 0, 0.9238795325112867] },
      light: { kind: "directional", color: "#ffffff", intensity: 2, castShadow: true } }];
    frame.environment.shadows.enabled = true;
    const capture = await captureGameFrame3D(frame, { resolveAsset: async () => skinnedGlb() });
    expect(capture.stats.drawCalls).toBeGreaterThan(3);
    const image = await loadImage(Buffer.from(capture.png));
    const canvas = createCanvas(128, 128); const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, 128, 128).data;
    const regions: number[][] = [[], []];
    for (let y = 40; y < 90; y++) {
      for (let x = 0; x < 128; x++) {
        const offset = (y * 128 + x) * 4;
        if ((rgba[offset] ?? 0) > 100 && (rgba[offset + 1] ?? 0) > 100) { regions[x < 64 ? 0 : 1]?.push(x); }
      }
    }
    const left = regions[0] ?? []; const right = regions[1] ?? [];
    expect(left.length).toBeGreaterThan(0); expect(right.length).toBeGreaterThan(0);
    expect(left.reduce((sum, x) => sum + x, 0) / left.length).toBeCloseTo(47, -1);
    expect(right.reduce((sum, x) => sum + x, 0) / right.length).toBeCloseTo(97, -1);
    frame.tick = 12;
    const rewound = await captureGameFrame3D(frame, { resolveAsset: async () => skinnedGlb() });
    expect(rewound.png).not.toEqual(capture.png);
    frame.tick = 30;
    const restored = await captureGameFrame3D(frame, { resolveAsset: async () => skinnedGlb() });
    expect(restored.png).toEqual(capture.png);
    frame.entities[0].animation = { clipId: "clip:2", startTick: 0, playbackRate: 1, loop: false };
    frame.entities[1].animation = { clipId: "clip:0", startTick: 0, playbackRate: 1, loop: true };
    const jumping = await captureGameFrame3D(frame, { resolveAsset: async () => skinnedGlb() });
    expect(jumping.png).not.toEqual(capture.png);
  }, 40_000);

});

describe("committed 3D font bindings", () => {
  it("loads verified fonts before HUD painting and reports optional fallback", async () => {
    const bytes = await readFile(resolve("../timeline/fonts/Inter-Variable.ttf"));
    const frame = blockoutFrame();
    frame.hud = [{ id: "font", text: "Verified game font", x: 4, y: 4, size: 16, fontId: "font" }];
    frame.fonts = { font: { mediaKind: "font", assetId: "owned-font", digest: createHash("sha256").update(bytes).digest("hex"), required: true, fontFormat: "ttf" } };
    const captured = await captureGameFrame3D(frame, { resolveAsset: async () => bytes });
    expect(captured.stats.diagnostics).toEqual([]);
    frame.fonts.font.required = false;
    const fallback = await captureGameFrame3D(frame, { resolveAsset: async () => null });
    expect(fallback.stats.diagnostics[0]).toContain("Optional font font");
    expect(fallback.png).not.toEqual(captured.png);
    frame.fonts.font.required = true;
    await expect(captureGameFrame3D(frame, { resolveAsset: async () => new Uint8Array([1, 2, 3]) })).rejects.toThrow("font digest changed");
  }, 40_000);
});
