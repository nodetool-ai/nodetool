import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { createScriptedGameSession, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { gameDocument, gameParticleEmitter, gameParticleSprite, type GameRenderFrame } from "@nodetool-ai/protocol";
import { describe, expect, it, vi } from "vitest";

import { AssetCache, Canvas2DGameRenderer } from "../src/canvas2d.js";
import { visibleItems } from "../src/frame.js";
import { captureGameFrame } from "../src/node.js";
import {
  CANVAS2D_MAX_PARTICLES,
  GameParticles2D,
  PARTICLE_DOT_ASSET,
  particleCell,
  type GameParticleField,
  type ParticleView
} from "../src/index.js";
import { WebGPUGameRenderer } from "../src/webgpu.js";

/** 8 by 8 world units at 8 pixels per unit, so world (x, y) is pixel (32 + 8x, 32 - 8y). */
function frame(overrides: Partial<GameRenderFrame> = {}): GameRenderFrame {
  return { tick: 1, width: 8, height: 8, pixelsPerUnit: 8, camera: { x: 0, y: 0, zoom: 1 }, sprites: [], tiles: [], hud: [], ...overrides };
}

const wall: GameRenderFrame["sprites"][number] = { entityId: "wall", assetId: "wall", x: 0, y: 0, previousX: 0, previousY: 0,
  rotation: 0, scaleX: 1, scaleY: 1, width: 4, height: 4, layer: 0, unlit: true };

function particle(emitter: unknown, overrides: Partial<ParticleView> = {}): ParticleView {
  return { entityId: "torch", emitterId: "e", emitter: gameParticleEmitter.parse({ id: "e", ...(emitter as object) }),
    x: 0, y: 0, z: 0, size: 2, rotation: 0, r: 1, g: 1, b: 1, opacity: 1, life: 0, ...overrides };
}

function field(particles: readonly ParticleView[]): GameParticleField {
  return { forEachParticle: (visit) => particles.forEach((entry) => visit(entry)) };
}

/** The dot's alpha falls off from its centre, so a centre sample is close to, not exactly, the particle colour. */
function expectNear(actual: readonly number[], expected: readonly number[]): void {
  expected.forEach((value, channel) => expect(Math.abs((actual[channel] ?? 0) - value), `channel ${channel}`).toBeLessThanOrEqual(8));
}

async function pixel(png: Uint8Array, x: number, y: number): Promise<number[]> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
}

describe("particle sprite sheet cells", () => {
  it("plays frames over the particle's life and holds the last frame at death", () => {
    const sheet = gameParticleSprite.parse({ assetId: "sheet", columns: 2, rows: 2 });
    expect([0, 0.3, 0.5, 0.99, 1].map((life) => particleCell(sheet, life)?.index)).toEqual([0, 1, 2, 3, 3]);
    expect(particleCell({ ...sheet, cycles: 2 }, 0.5)?.index).toBe(0);
    expect(particleCell({ ...sheet, frameCount: 3 }, 1)?.index).toBe(2);
    expect(particleCell(gameParticleSprite.parse({ assetId: "single" }), 0.5)).toBeUndefined();
  });
});

describe("particles in the 2D sprite list", () => {
  it("draws particles above sprites of their entity's layer unless the emitter sets a layer", () => {
    const input = frame({ sprites: [{ ...wall, entityId: "torch", assetId: "torch", layer: 2 }, { ...wall, layer: 1 }] });
    const items = visibleItems(input, 1, 0, { field: field([
      particle({}, { entityId: "torch" }),
      particle({ layer: 0 }, { entityId: "torch" }),
      particle({}, { entityId: "loose" })
    ]) });
    expect(items.map((item) => [item.item.entityId, item.item.layer, item.particle === true])).toEqual([
      ["torch", 0, true], ["loose", 0, true], ["wall", 1, false], ["torch", 2, false], ["torch", 2, true]
    ]);
  });

  it("carries colour, blend, lighting opt-out, sampling and sheet cell", () => {
    const [dot] = visibleItems(frame(), 1, 0, { field: field([particle({ blend: "additive", unlit: true }, { r: 1, g: 0.5, b: 0, opacity: 0.25, rotation: 1 })]) });
    expect(dot).toMatchObject({ assetId: PARTICLE_DOT_ASSET, tint: "#ff8000", opacity: 0.25, rotation: 1, blend: "additive", unlit: true, sampling: "linear", width: 2, height: 2 });
    const [sheet] = visibleItems(frame(), 1, 0, { field: field([particle({ sprite: { assetId: "sheet", columns: 4 } }, { life: 0.6 })]) });
    expect(sheet).toMatchObject({ assetId: "sheet", blend: "normal", unlit: false, sampling: "nearest", cell: { index: 2, columns: 4, rows: 1 } });
  });

  it("culls particles outside the camera and stops at the backend's limit", () => {
    const many = Array.from({ length: 5 }, (_, index) => particle({}, { x: index * 0.1 }));
    expect(visibleItems(frame(), 1, 0, { field: field([particle({}, { x: 50 }), ...many]) })).toHaveLength(5);
    expect(visibleItems(frame(), 1, 0, { field: field(many), limit: 2 })).toHaveLength(2);
  });
});

describe("Canvas2D particle fallback", () => {
  it("draws tinted dots and stops at the Canvas2D cap", async () => {
    const output = createCanvas(64, 64);
    vi.stubGlobal("document", { createElement: () => createCanvas(1, 1) });
    vi.stubGlobal("HTMLImageElement", class {});
    const renderer = new Canvas2DGameRenderer(output as unknown as HTMLCanvasElement, new AssetCache(async () => null));
    try {
      const crowd = Array.from({ length: CANVAS2D_MAX_PARTICLES + 500 }, () => particle({}, { x: 3, y: 3, size: 0.5 }));
      const stats = await renderer.render(frame(), 1, field([particle({}, { r: 1, g: 0, b: 0, size: 4 }), ...crowd]));
      expect(stats.drawCalls).toBe(CANVAS2D_MAX_PARTICLES);
      expectNear([...output.getContext("2d").getImageData(32, 32, 1, 1).data], [255, 0, 0, 255]);
    } finally {
      renderer.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("cuts sprite sheet cells in headless capture", async () => {
    const sheet = createCanvas(2, 1);
    const context = sheet.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "#00ff00";
    context.fillRect(1, 0, 1, 1);
    const png = await captureGameFrame(frame(), { resolveAsset: async () => sheet.toBuffer("image/png"),
      particles: field([particle({ sprite: { assetId: "sheet", columns: 2 } }, { life: 0.75 })]) });
    expect(await pixel(png, 32, 32)).toEqual([0, 255, 0, 255]);
  });

  it("adds light for additive particles over a sprite in headless capture", async () => {
    const plain = await captureGameFrame(frame({ sprites: [wall] }));
    const lit = await captureGameFrame(frame({ sprites: [wall] }), { particles: field([particle({ blend: "additive" }, { r: 0.5, g: 0.5, b: 0.5 })]) });
    const before = await pixel(plain, 32, 32);
    const after = await pixel(lit, 32, 32);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(after[channel]).toBeGreaterThan((before[channel] ?? 0) + 60);
    }
  });
});

describe("WebGPU particle instances", () => {
  async function renderCentre(input: GameRenderFrame, particles: GameParticleField): Promise<number[]> {
    const device = await createNodeGPUDevice();
    const target = device.createTexture({ size: [64, 64], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    // A headless target stands in for the browser canvas's current texture.
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const renderer = new WebGPUGameRenderer({ width: 64, height: 64 } as HTMLCanvasElement, device, context, "rgba8unorm", new AssetCache(async () => null));
    const readback = device.createBuffer({ size: 64 * 64 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      await renderer.render(input, 1, particles);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 64 * 4 }, [64, 64]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const offset = (32 * 64 + 32) * 4;
      return [...new Uint8Array(readback.getMappedRange()).slice(offset, offset + 4)];
    } finally {
      readback.unmap();
      readback.destroy();
      renderer.dispose();
      target.destroy();
    }
  }

  it("draws additive dots over sprites and alpha dots over them", async () => {
    const before = await renderCentre(frame({ sprites: [wall] }), field([]));
    const added = await renderCentre(frame({ sprites: [wall] }), field([particle({ blend: "additive" }, { r: 0.5, g: 0.5, b: 0.5 })]));
    const covered = await renderCentre(frame({ sprites: [wall] }), field([particle({}, { r: 1, g: 0, b: 0 })]));
    for (let channel = 0; channel < 3; channel += 1) {
      expect(added[channel]).toBeGreaterThan((before[channel] ?? 0) + 60);
    }
    expectNear(covered, [255, 0, 0]);
  }, 30000);

  it("lights particles unless the emitter opts out", async () => {
    const dark = frame({ lighting: { ambient: { color: "#ffffff", intensity: 0 }, points: [] } });
    const lit = await renderCentre(dark, field([particle({}, { r: 1, g: 1, b: 0 })]));
    const unlit = await renderCentre(dark, field([particle({ unlit: true }, { r: 1, g: 1, b: 0 })]));
    expectNear(lit, [0, 0, 0]);
    expectNear(unlit, [255, 255, 0]);
  }, 30000);
});

describe("2D particles beside a session", () => {
  it("follows emitParticles from a 2D script without changing the snapshot", async () => {
    const base = createTopDownRoomGame("particles-render");
    const document = gameDocument.parse({ ...base, schemaVersion: 2, scenes: base.scenes.map((scene, index) => index === 0 ? { ...scene, entities: [...scene.entities, {
      id: "torch", transform2d: { x: 1, y: 2 },
      particles: { emitters: [{ id: "burst", playOnStart: false, rate: 0, lifetime: 10, speed: 0, blend: "additive" }] },
      behaviors: [{ kind: "script", maxTickMs: 50, source: "({tick}) => ({ state: null, commands: tick === 0 ? [{ kind: 'emitParticles', count: 6 }] : [] })" }]
    }] } : scene) });
    const session = await createScriptedGameSession(document, 1);
    const plain = await createScriptedGameSession(document, 1);
    try {
      const particles = new GameParticles2D(document.tickRate);
      for (let tick = 0; tick < 3; tick += 1) {
        const step = session.step({ pressed: [], justPressed: [] });
        plain.step({ pressed: [], justPressed: [] });
        particles.tick(step.frame, session.takePresentationEvents());
        expect(JSON.stringify(session.snapshot())).toBe(JSON.stringify(plain.snapshot()));
      }
      expect(particles.count).toBe(6);
      const items = visibleItems(session.frame(), 1, 0, { field: particles }).filter((item) => item.particle);
      expect(items).toHaveLength(6);
      expect(items[0]).toMatchObject({ x: 1, y: 2, blend: "additive", assetId: PARTICLE_DOT_ASSET });
      particles.clear();
      expect(particles.count).toBe(0);
    } finally {
      session.dispose();
      plain.dispose();
    }
  });
});
