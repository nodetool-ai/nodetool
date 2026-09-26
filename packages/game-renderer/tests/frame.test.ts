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
});
