import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { describe, expect, it } from "vitest";
import { visibleItems } from "../src/frame.js";
import { captureGameFrame } from "../src/node.js";

function frame(): GameRenderFrame {
  return {
    tick: 1,
    width: 16,
    height: 9,
    pixelsPerUnit: 32,
    camera: { x: 0, y: 0, zoom: 1 },
    sprites: [{ entityId: "player", assetId: "player", x: 2, y: 0, previousX: 0, previousY: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1, layer: 1 }],
    tiles: [{ entityId: "wall", assetId: "wall", x: 2, y: 0, width: 1, height: 1, layer: 0 }],
    hud: [],
  };
}

describe("game frame projection", () => {
  it("interpolates sprites, culls outside the camera, and preserves layer order", () => {
    const input = frame();
    input.sprites.push({ entityId: "far", assetId: "gem", x: 100, y: 0, previousX: 100, previousY: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1, layer: 2 });
    const items = visibleItems(input, 0.5);
    expect(items.map((item) => item.item.entityId)).toEqual(["wall", "player"]);
    expect(items[1]?.x).toBe(1);
  });

  it("interpolates unwrapped rotation, tint, opacity, scale, and camera", () => {
    const input = frame();
    input.camera = { x: 2, y: 0, previousX: 0, previousY: 0, zoom: 1 };
    Object.assign(input.sprites[0]!, { x: 4, previousX: 0, rotation: Math.PI * 2,
      previousRotation: 0, scaleX: 3, previousScaleX: 1, opacity: 0, previousOpacity: 1,
      tint: "#ffffff", previousTint: "#000000" });
    const sprite = visibleItems(input, 0.5).find((item) => item.item.entityId === "player");
    expect(sprite).toMatchObject({ x: 2, rotation: Math.PI, width: 2, opacity: 0.5, tint: "#808080" });
  });

  it("projects repeat and mirror backgrounds across negative offsets", () => {
    const input = frame();
    input.sprites = [];
    input.tiles = [];
    input.camera = { x: -4, y: 0, previousX: -6, previousY: 0, zoom: 1 };
    input.backgrounds = [{ id: "sky", assetId: "atlas", width: 4, height: 4, layer: -10,
      origin: { x: 0, y: 0 }, parallax: { x: 0, y: 0 }, scrollRate: { x: 0, y: 0 }, mode: "mirror" }];
    const first = visibleItems(input, 0);
    const second = visibleItems(input, 1);
    expect(first.map((item) => item.x)).toEqual(second.map((item) => item.x - 2));
    expect(first.some((item) => item.flipX)).toBe(true);
    expect(first.some((item) => !item.flipX)).toBe(true);
  });

  it("keeps mirror orientation when scrolling crosses one tile in either direction", () => {
    const input = frame();
    input.tick = 120;
    input.sprites = [];
    input.tiles = [];
    input.backgrounds = [{ id: "sky", assetId: "atlas", width: 2, height: 2, layer: -10,
      origin: { x: 0, y: 0 }, parallax: { x: 1, y: 1 }, scrollRate: { x: 1, y: 1 }, mode: "mirror" }];
    const before = visibleItems(input, 0).find((item) => Math.abs(item.x) < 0.02 && Math.abs(item.y) < 0.02);
    const boundary = visibleItems(input, 1).find((item) => item.x === 0 && item.y === 0);
    expect(before).toMatchObject({ flipX: true, flipY: true });
    expect(boundary).toMatchObject({ flipX: true, flipY: true });

    input.backgrounds[0]!.scrollRate = { x: -1, y: -1 };
    const negativeBoundary = visibleItems(input, 1).find((item) => item.x === 0 && item.y === 0);
    expect(negativeBoundary).toMatchObject({ flipX: true, flipY: true });
  });

  it("keeps nonrepeating backgrounds at their unwrapped scroll positions", () => {
    const input = frame();
    input.tick = 120;
    input.sprites = [];
    input.tiles = [];
    input.backgrounds = [{ id: "sky", assetId: "atlas", width: 2, height: 2, layer: -10,
      origin: { x: 0, y: 0 }, parallax: { x: 1, y: 1 }, scrollRate: { x: 1, y: -1 }, mode: "none" }];
    const before = visibleItems(input, 0);
    const boundary = visibleItems(input, 1);
    expect(before).toHaveLength(1);
    expect(boundary).toHaveLength(1);
    expect(before[0]?.x).toBeCloseTo(119 / 60);
    expect(before[0]?.y).toBeCloseTo(-119 / 60);
    expect(boundary[0]).toMatchObject({ x: 2, y: -2 });
  });

  it("keeps mirrored scroll positions bounded after a day of ticks", () => {
    const input = frame();
    input.tick = 60 * (24 * 60 * 60 + 2) + 1;
    input.sprites = [];
    input.tiles = [];
    input.backgrounds = [{ id: "sky", assetId: "atlas", width: 2, height: 2, layer: -10,
      origin: { x: 0, y: 0 }, parallax: { x: 1, y: 1 }, scrollRate: { x: 1, y: -1 }, mode: "mirror" }];
    const center = visibleItems(input, 0).find((item) => item.x === 0 && item.y === 0);
    expect(center).toMatchObject({ flipX: true, flipY: true });
  });

  it("captures colored placeholders at world positions with painter order", async () => {
    const png = await captureGameFrame(frame());
    const image = await loadImage(Buffer.from(png));
    expect([image.width, image.height]).toEqual([512, 288]);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    expect(Array.from(context.getImageData(320, 144, 1, 1).data)).toEqual([42, 202, 233, 255]);
    expect(context.getImageData(256, 144, 1, 1).data[3]).toBe(0);
  });

  it("selects the requested atlas frame", async () => {
    const atlas = createCanvas(2, 1);
    const context = atlas.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "#0000ff";
    context.fillRect(1, 0, 1, 1);
    const input = frame();
    input.tiles = [];
    input.sprites[0]!.assetId = "atlas";
    input.sprites[0]!.frame = { x: 1, y: 0, width: 1, height: 1 };
    const png = await captureGameFrame(input, { resolveAsset: async () => atlas.toBuffer("image/png") });
    const image = await loadImage(Buffer.from(png));
    const output = createCanvas(image.width, image.height).getContext("2d");
    output.drawImage(image, 0, 0);
    expect(Array.from(output.getImageData(320, 144, 1, 1).data)).toEqual([0, 0, 255, 255]);
  });

  it("captures mirrored tiles from an atlas frame without sampling its neighbor", async () => {
    const atlas = createCanvas(3, 1);
    const source = atlas.getContext("2d");
    source.fillStyle = "#ff0000";
    source.fillRect(0, 0, 1, 1);
    source.fillStyle = "#0000ff";
    source.fillRect(1, 0, 1, 1);
    source.fillStyle = "#00ff00";
    source.fillRect(2, 0, 1, 1);
    const input = frame();
    input.sprites = [];
    input.tiles = [];
    input.backgrounds = [{ id: "sky", assetId: "atlas", width: 2, height: 2, layer: -10,
      origin: { x: 0, y: 0 }, parallax: { x: 1, y: 1 }, scrollRate: { x: 0, y: 0 },
      mode: "mirror", frame: { x: 0, y: 0, width: 2, height: 1 } }];
    const image = await loadImage(Buffer.from(await captureGameFrame(input, { resolveAsset: async () => atlas.toBuffer("image/png") })));
    const output = createCanvas(image.width, image.height).getContext("2d");
    output.drawImage(image, 0, 0);
    expect([...output.getImageData(287, 144, 1, 1).data]).toEqual([0, 0, 255, 255]);
    expect([...output.getImageData(288, 144, 1, 1).data]).toEqual([0, 0, 255, 255]);
    expect([...output.getImageData(336, 144, 1, 1).data]).toEqual([255, 0, 0, 255]);
  });
});

describe("headless blending", () => {
  it("applies ambient and colored point lights while keeping emissive sprites visible", async () => {
    const input = frame();
    input.tiles = [];
    input.sprites = [
      { entityId: "lit", assetId: "wall", x: -2, y: 0, previousX: -2, previousY: 0,
        rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1, layer: 0 },
      { entityId: "glow", assetId: "gem", x: 2, y: 0, previousX: 2, previousY: 0,
        rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1, layer: 1, unlit: true }
    ];
    input.lighting = { ambient: { color: "#ffffff", intensity: 0 },
      points: [
        { x: -2, y: 0, color: "#ff0000", intensity: 1, radius: 2, falloff: 1 },
        { x: -2, y: 0, color: "#00ff00", intensity: 1, radius: 2, falloff: 1 }
      ] };
    const image = await loadImage(Buffer.from(await captureGameFrame(input)));
    const output = createCanvas(image.width, image.height).getContext("2d");
    output.drawImage(image, 0, 0);
    const lit = [...output.getImageData(192, 144, 1, 1).data];
    expect(lit[0]).toBeGreaterThan(50);
    expect(lit[1]).toBeGreaterThan(50);
    expect(lit[2]).toBe(0);
    expect([...output.getImageData(320, 144, 1, 1).data]).toEqual([255, 196, 50, 255]);
  });
  it("adds additive sprites in captures", async () => {
    const input = frame();
    input.tiles = [];
    input.sprites = ["normal", "additive"].map((blend, index) => ({ entityId: `s${index}`, assetId: "wall", x: 0, y: 0,
      previousX: 0, previousY: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 2, height: 2, layer: 0, blend: blend as "normal" | "additive" }));
    const image = await loadImage(Buffer.from(await captureGameFrame(input)));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    expect([...context.getImageData(256, 144, 1, 1).data]).toEqual([184, 210, 240, 255]);
  });
});
