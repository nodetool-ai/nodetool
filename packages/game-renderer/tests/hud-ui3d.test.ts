import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { createGameSession3D, createScriptedGameSession } from "@nodetool-ai/game-runtime";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GameInput } from "../src/input-bindings.js";
import { captureGameFrame } from "../src/node.js";
import { captureGameFrame3D } from "../src/node3d.js";
import { paintGameHud } from "../src/renderer3d/hud/paint.js";
import { GameUiController } from "../src/ui/controller.js";
import { gameUiViewport3D } from "../src/ui/hud3d.js";
import type { GameUiMeasureText } from "../src/ui/layout.js";
import { hudWidgetsGame2D, hudWidgetsGame3D } from "./fixtures/hud-widgets.js";

const measure: GameUiMeasureText = (text) => text.length * 8;

async function firstFrame3D(): Promise<GameRenderFrame3D> {
  const session = await createGameSession3D(hudWidgetsGame3D(), 1);
  try { return session.step({ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } }).frame; } finally { session.dispose(); }
}

function pixels(image: Image): (x: number, y: number, width?: number, height?: number) => number[] {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return (x, y, width = 1, height = 1) => [...context.getImageData(x, y, width, height).data];
}

describe("3D HUD module", () => {
  it("paints the widget tree under the hud labels on the HUD canvas", async () => {
    const frame = await firstFrame3D();
    frame.hud = [{ id: "label", text: "label", x: 200, y: 120, size: 18, color: "#ffff00" }];
    const canvas = createCanvas(1, 1);
    const texture = { needsUpdate: false };
    paintGameHud(canvas as unknown as HTMLCanvasElement, texture as THREE.CanvasTexture, frame);
    expect([canvas.width, canvas.height, texture.needsUpdate]).toEqual([512, 288, true]);
    const pixel = pixels(canvas as unknown as Image);
    expect(pixel(16 + 170, 46)).toEqual([0xe0, 0x48, 0x48, 255]);
    expect(pixel(512 - 16 - 130, 16 + 4)).toEqual([0x14, 0x32, 0x5a, 255]);
    expect(pixel(256 - 50, 288 - 16 - 5)).toEqual([0x3a, 0x8a, 0x3a, 255]);
    // Outside the widgets the HUD stays transparent, and the label still draws.
    expect(pixel(256, 60)).toEqual([0, 0, 0, 0]);
    const label = pixel(200, 120, 60, 24);
    expect(label.some((value, index) => index % 4 === 0 && value > 200 && label[index + 1] > 200 && label[index + 2] < 80)).toBe(true);
  });

  it("presses the pause button's action on the 3D input from a pointer in HUD pixels", async () => {
    const document = hudWidgetsGame3D();
    const frame = await firstFrame3D();
    const input = new GameInput();
    const hud = new GameUiController(input, measure);
    hud.update(frame.ui, gameUiViewport3D(frame));
    expect(hud.pointerDown(1, 10, 10)).toBe(false);
    expect(hud.pointerDown(1, 256, 288 - 30)).toBe(true);
    expect(input.sample(document)).toMatchObject({ pressed: ["pause"], justPressed: ["pause"] });
    hud.pointerUp(1);
    expect(input.sample(document).pressed).toEqual([]);
  });
});

describe("HUD parity capture", () => {
  it("paints the health bar, score panel and pause button the same in 2D and 3D captures", async () => {
    const session2D = await createScriptedGameSession(hudWidgetsGame2D(), 1);
    const frame2D = session2D.step({ pressed: [], justPressed: [] }).frame;
    session2D.dispose();
    const frame3D = await firstFrame3D();
    const image2D = await loadImage(Buffer.from(await captureGameFrame(frame2D)));
    const capture3D = await captureGameFrame3D(frame3D);
    const image3D = await loadImage(Buffer.from(capture3D.png));
    expect([image3D.width, image3D.height]).toEqual([image2D.width, image2D.height]);
    const at2D = pixels(image2D);
    const at3D = pixels(image3D);
    // The full health bar, the score panel fill and the pause button fill, sampled where no text draws.
    for (const [x, y, width, height] of [[16, 41, 180, 11], [364, 18, 20, 36], [210, 236, 10, 32]]) {
      expect(at3D(x, y, width, height)).toEqual(at2D(x, y, width, height));
    }
    expect(at3D(16 + 170, 46)).toEqual([0xe0, 0x48, 0x48, 255]);
    // The score and button labels draw light pixels inside their boxes in both captures.
    for (const at of [at2D, at3D]) {
      const panel = at(512 - 16 - 140, 16, 140, 40);
      expect(panel.some((value, index) => index % 4 === 0 && value > 200 && panel[index + 1] > 200)).toBe(true);
      const button = at(256 - 56, 288 - 56, 112, 40);
      expect(button.some((value, index) => index % 4 === 0 && value > 200 && button[index + 1] > 200 && button[index + 2] > 200)).toBe(true);
    }
  }, 60_000);
});
