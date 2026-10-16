import { createCanvas, loadImage } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { gameParticles, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { GameParticleField } from "../src/particles/render2d.js";
import { prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";
import { captureGameFrame3D } from "../src/node3d.js";
import { blockoutFrame, skinnedGlb, triangleGlb } from "./fixtures/game3d.js";

async function centerPixel(png: Uint8Array): Promise<Uint8ClampedArray> {
  const canvas = createCanvas(128, 128);
  const context = canvas.getContext("2d");
  context.drawImage(await loadImage(Buffer.from(png)), 0, 0);
  return context.getImageData(64, 64, 1, 1).data;
}

async function pixels(png: Uint8Array): Promise<Uint8ClampedArray> {
  const canvas = createCanvas(128, 128);
  const context = canvas.getContext("2d");
  context.drawImage(await loadImage(Buffer.from(png)), 0, 0);
  return context.getImageData(0, 0, 128, 128).data;
}

async function decalFrame(transparent = false): Promise<{ frame: GameRenderFrame3D; bytes: Uint8Array }> {
  const image = createCanvas(16, 16);
  const context = image.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, transparent ? 8 : 16, 16);
  const bytes = new Uint8Array(image.toBuffer("image/png"));
  const prepared = await prepareGameImage3D(bytes, { assetId: "paint" });
  if (!prepared.ok) { throw new Error("Fixture image preparation failed"); }
  const frame = blockoutFrame();
  const receiver = frame.entities[0];
  if (!receiver) { throw new Error("Fixture receiver is missing"); }
  frame.images = { paint: prepared.image.binding };
  const transform = { ...receiver.transform, position: { x: 0, y: 0, z: 1 } };
  frame.entities.push({ entityId: "paint-projector", transform, previousTransform: transform,
    decal3d: { assetId: "paint", receiverId: "box", size: { x: 1, y: 1, z: 0.5 }, opacity: 1, renderOrder: 0 } });
  return { frame, bytes };
}

it("projects a real image onto the explicit receiver in Chromium", async () => {
  const { frame, bytes } = await decalFrame();
  const painted = await captureGameFrame3D(frame, { resolveAsset: async () => bytes });
  const pixel = await centerPixel(painted.png);
  expect(pixel[0]).toBeGreaterThan(150);
  expect(pixel[0]).toBeGreaterThan((pixel[2] ?? 255) + 100);
  expect(painted.stats.diagnostics).toEqual([]);
  expect(painted.stats.textureBytes).toBeGreaterThan(128 * 128 * 4);
}, 40_000);

it("renders bounded exponential height fog in Chromium", async () => {
  const frame = blockoutFrame();
  const clear = await captureGameFrame3D(frame);
  frame.environment.fog = { kind: "height", color: "#ffffff", density: 10, baseHeight: 0, heightFalloff: 0.2, maxOpacity: 1 };
  const fogged = await captureGameFrame3D(frame);
  const before = await centerPixel(clear.png);
  const after = await centerPixel(fogged.png);
  expect(before[2]).toBeGreaterThan((before[0] ?? 255) + 100);
  expect(after[0]).toBeGreaterThan(240);
  expect(after[1]).toBeGreaterThan(240);
  expect(after[2]).toBeGreaterThan(240);
  expect(fogged.stats.diagnostics).toEqual([]);
}, 40_000);

it("preserves image alpha, foreground occlusion and exact zero-opacity parity", async () => {
  const { frame, bytes } = await decalFrame(true);
  const capture = () => captureGameFrame3D(frame, { resolveAsset: async () => bytes });
  const painted = await pixels((await capture()).png);
  const left = (64 * 128 + 56) * 4;
  const right = (64 * 128 + 72) * 4;
  expect(painted[left]).toBeGreaterThan(150);
  expect(painted[right + 2]).toBeGreaterThan((painted[right] ?? 255) + 100);
  const projector = frame.entities.find(entity => entity.decal3d);
  if (!projector?.decal3d) { throw new Error("Fixture projector is missing"); }
  projector.decal3d.opacity = 0;
  const disabled = await pixels((await capture()).png);
  expect(disabled).toEqual(await pixels((await captureGameFrame3D(blockoutFrame())).png));
  projector.decal3d.opacity = 1;
  const transform = { ...projector.transform, position: { x: 0, y: 0, z: 2 } };
  frame.entities.push({ entityId: "foreground", transform, previousTransform: transform,
    primitive: { kind: "box", dimensions: { x: 0.6, y: 0.6, z: 0.3 }, castShadow: false, receiveShadow: false,
      material: { color: "#00ff00", metalness: 0, roughness: 1, opacity: 1, alphaMode: "opaque", alphaCutoff: 0.5 } } });
  const covered = await centerPixel((await capture()).png);
  expect(covered[1]).toBeGreaterThan((covered[0] ?? 255) + 100);
}, 40_000);

it("projects onto transformed rigid GLB receiver nodes", async () => {
  const { frame, bytes } = await decalFrame();
  const receiver = frame.entities[0];
  const projector = frame.entities.find(entity => entity.decal3d);
  if (!receiver || !projector?.decal3d) { throw new Error("Fixture receiver or projector is missing"); }
  delete receiver.primitive;
  receiver.model = { assetId: "rigid", castShadow: false, receiveShadow: false };
  projector.transform.position.z = 0;
  projector.previousTransform = structuredClone(projector.transform);
  const model = triangleGlb({ nodes: [{ mesh: 0, scale: [-1, 2, 0.5] }] });
  const captured = await captureGameFrame3D(frame, { resolveAsset: async id => id === "rigid" ? model : bytes });
  const pixel = await centerPixel(captured.png);
  expect(pixel[0]).toBeGreaterThan((pixel[2] ?? 255) + 100);
  expect(captured.stats.diagnostics).toEqual([]);
}, 40_000);

it("keeps a real GLB blend pane in front when decal order or unrelated entity order changes", async () => {
  const { frame, bytes } = await decalFrame();
  const projector = frame.entities.find(entity => entity.decal3d);
  if (!projector?.decal3d) { throw new Error("Fixture projector is missing"); }
  const transform = { ...projector.transform, position: { x: 0, y: 0, z: 2 } };
  frame.entities.push({ entityId: "glass", transform, previousTransform: transform,
    model: { assetId: "glass", castShadow: false, receiveShadow: false } });
  const glass = triangleGlb({
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ alphaMode: "BLEND", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 0.5] },
      extensions: { KHR_materials_unlit: {} } }], extensionsUsed: ["KHR_materials_unlit"]
  });
  const capture = () => captureGameFrame3D(frame, { resolveAsset: async id => id === "glass" ? glass : bytes });
  const reference = await pixels((await capture()).png);
  const center = (64 * 128 + 64) * 4;
  expect(reference[center]).toBeGreaterThan(0);
  expect(reference[center + 1]).toBeGreaterThan(0);
  projector.decal3d.renderOrder = 1;
  expect(await pixels((await capture()).png)).toEqual(reference);
  projector.decal3d.renderOrder = 0;
  const unrelated = structuredClone(projector);
  unrelated.entityId = "unrelated-projector";
  unrelated.transform.position.x = 40;
  unrelated.previousTransform = structuredClone(unrelated.transform);
  frame.entities.unshift(unrelated);
  expect(await pixels((await capture()).png)).toEqual(reference);
}, 40_000);

it("uses world altitude for perspective and orthographic camera rays", async () => {
  for (const orthographic of [false, true]) {
    const frame = blockoutFrame();
    if (orthographic) { frame.camera.projection = { kind: "orthographic", size: 4, near: 0.1, far: 100 }; }
    frame.environment.fog = { kind: "height", color: "#ffffff", density: 0.2, baseHeight: 0, heightFalloff: 1, maxOpacity: 1 };
    const low = await centerPixel((await captureGameFrame3D(frame)).png);
    const receiver = frame.entities[0];
    if (!receiver) { throw new Error("Fixture receiver is missing"); }
    receiver.transform.position.y = 2;
    receiver.previousTransform = structuredClone(receiver.transform);
    frame.camera.transform.position.y = 2;
    const high = await centerPixel((await captureGameFrame3D(frame)).png);
    expect(low[0]).toBeGreaterThan((high[0] ?? 255) + 50);
  }
}, 40_000);

it("keeps no-fog pixels exact at zero height-fog opacity", async () => {
  const frame = blockoutFrame();
  const clear = await pixels((await captureGameFrame3D(frame)).png);
  frame.environment.fog = { kind: "height", color: "#ffffff", density: 10, baseHeight: 0, heightFalloff: 0.2, maxOpacity: 0 };
  expect(await pixels((await captureGameFrame3D(frame)).png)).toEqual(clear);
}, 40_000);

it("applies height fog to deformed model vertices and newly created particle materials", async () => {
  const frame = blockoutFrame();
  const receiver = frame.entities[0];
  if (!receiver) { throw new Error("Fixture receiver is missing"); }
  frame.environment.fog = { kind: "height", color: "#ff0000", density: 10, baseHeight: 0, heightFalloff: 0.2, maxOpacity: 1 };
  delete receiver.primitive;
  receiver.model = { assetId: "skin", castShadow: false, receiveShadow: false };
  receiver.animation = { clipId: "clip:1", startTick: 0, playbackRate: 1, loop: true };
  frame.tick = 15;
  frame.camera.transform.position.x = 0.375;
  const model = await centerPixel((await captureGameFrame3D(frame, { resolveAsset: async () => skinnedGlb() })).png);
  expect(model[0]).toBeGreaterThan(240);
  expect(model[1]).toBeLessThan(10);
  frame.camera.transform.position.x = 0;
  const particles = gameParticles.parse({ emitters: [{ id: "mist", blend: "normal", unlit: true }] });
  const emitter = particles.emitters[0];
  if (!emitter) { throw new Error("Fixture emitter is missing"); }
  frame.entities = [{ entityId: "mist", transform: receiver.transform, previousTransform: receiver.transform, particles }];
  const field: GameParticleField = { forEachParticle: visit => visit({ entityId: "mist", emitterId: "mist", emitter,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 2, rotation: 0, r: 0, g: 0, b: 1, opacity: 1, life: 0.5 }) };
  const particle = await centerPixel((await captureGameFrame3D(frame, { particles: field })).png);
  expect(particle[0]).toBeGreaterThan(240);
  expect(particle[2]).toBeLessThan(10);
}, 40_000);
