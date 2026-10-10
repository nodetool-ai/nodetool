import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createScriptedGameSession } from "@nodetool-ai/game-runtime";
import type { GameUiFrame } from "@nodetool-ai/protocol";
import { describe, expect, it } from "vitest";
import { GameInput, type GamepadLike } from "../src/input-bindings.js";
import { captureGameFrame } from "../src/node.js";
import { GameUiController, layoutGameUi, nextGameUiFocus, type GameUiMeasureText } from "../src/ui/index.js";
import { hudWidgetsGame2D } from "./fixtures/hud-widgets.js";

// Eight HUD pixels per character, so text sizes are exact.
const measure: GameUiMeasureText = (text) => text.length * 8;
const viewport = { width: 512, height: 288 };

function frame(nodes: GameUiFrame["nodes"], extra: Partial<GameUiFrame> = {}): GameUiFrame {
  return { safeArea: true, focusNavigation: false, nodes, ...extra };
}

function boxOf(boxes: ReturnType<typeof layoutGameUi>, id: string): { x: number; y: number; width: number; height: number } {
  const box = boxes.find((candidate) => candidate.node.id === id);
  if (!box) { throw new Error(`No box ${id}`); }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

describe("HUD layout", () => {
  it("places nodes by anchor, pivot and offset inside the parent rectangle", () => {
    const boxes = layoutGameUi(frame([
      { kind: "panel", id: "corner", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 16 }, width: 140, height: 40 },
      { kind: "text", id: "label", parent: "corner", anchor: { x: 0.5, y: 0.5 }, text: "Score 0", size: 16 },
      { kind: "button", id: "pause", anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: -16 }, width: 100, height: 40, action: "pause" },
      { kind: "panel", id: "pinned", anchor: { x: 1, y: 1 }, pivot: { x: 0, y: 0 }, width: 10, height: 10 }
    ]), viewport, measure);
    expect(boxOf(boxes, "corner")).toEqual({ x: 512 - 16 - 140, y: 16, width: 140, height: 40 });
    expect(boxOf(boxes, "label")).toEqual({ x: 356 + 70 - 28, y: 16 + 20 - 10, width: 56, height: 20 });
    expect(boxOf(boxes, "pause")).toEqual({ x: 206, y: 288 - 16 - 40, width: 100, height: 40 });
    expect(boxOf(boxes, "pinned")).toEqual({ x: 512, y: 288, width: 10, height: 10 });
  });

  it("flows stack and grid children and sizes containers from them", () => {
    const boxes = layoutGameUi(frame([
      { kind: "stack", id: "column", gap: 4, padding: 2, align: "center" },
      { kind: "text", id: "a", parent: "column", text: "abcd", size: 8 },
      { kind: "text", id: "b", parent: "column", text: "ab", size: 8 },
      { kind: "grid", id: "slots", anchor: { x: 1, y: 1 }, columns: 2, gap: 2 },
      ...[0, 1, 2].map((index) => ({ kind: "panel" as const, id: `slot${index}`, parent: "slots", width: 10, height: 6 }))
    ]), viewport, measure);
    expect(boxOf(boxes, "column")).toEqual({ x: 0, y: 0, width: 36, height: 28 });
    expect(boxOf(boxes, "a")).toEqual({ x: 2, y: 2, width: 32, height: 10 });
    expect(boxOf(boxes, "b")).toEqual({ x: 10, y: 16, width: 16, height: 10 });
    expect(boxOf(boxes, "slots")).toEqual({ x: 512 - 22, y: 288 - 14, width: 22, height: 14 });
    expect(boxOf(boxes, "slot2")).toEqual({ x: 490, y: 282, width: 10, height: 6 });
  });

  it("keeps anchors inside the safe area unless the tree opts out, and drops hidden subtrees", () => {
    const nodes: GameUiFrame["nodes"] = [
      { kind: "panel", id: "top", anchor: { x: 1, y: 0 }, width: 10, height: 10, opacity: 0.5 },
      { kind: "panel", id: "inner", parent: "top", width: 2, height: 2, opacity: 0.5 },
      { kind: "panel", id: "hidden", visible: false, width: 4, height: 4 },
      { kind: "panel", id: "orphan", parent: "hidden", width: 4, height: 4 }
    ];
    const insets = { top: 20, right: 30, bottom: 0, left: 0 };
    const safe = layoutGameUi(frame(nodes), viewport, measure, insets);
    expect(boxOf(safe, "top")).toMatchObject({ x: 512 - 30 - 10, y: 20 });
    expect(safe.find((box) => box.node.id === "inner")?.opacity).toBe(0.25);
    expect(safe.map((box) => box.node.id)).toEqual(["top", "inner"]);
    expect(boxOf(layoutGameUi(frame(nodes, { safeArea: false }), viewport, measure, insets), "top")).toMatchObject({ x: 502, y: 0 });
  });

  it("moves focus to the nearest button in the pressed direction", () => {
    const button = (id: string, x: number, y: number) => ({ kind: "button" as const, id, action: "a", offset: { x, y }, width: 40, height: 20 });
    const boxes = layoutGameUi(frame([button("left", 0, 100), button("right", 200, 100), button("below", 0, 200), button("far", 400, 300)]), viewport, measure);
    expect(nextGameUiFocus(boxes, undefined, "right")).toBe("left");
    expect(nextGameUiFocus(boxes, "left", "right")).toBe("right");
    expect(nextGameUiFocus(boxes, "left", "down")).toBe("below");
    expect(nextGameUiFocus(boxes, "left", "up")).toBe("left");
  });
});

function pad(pressed: readonly number[]): GamepadLike {
  return { connected: true, axes: [], buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0 })) };
}

describe("HUD buttons", () => {
  it("press their input action with a pointer or a touch until it lifts", async () => {
    const document = hudWidgetsGame2D();
    const session = await createScriptedGameSession(document, 1);
    const input = new GameInput();
    const controller = new GameUiController(input, measure);
    controller.update(session.frame().ui, viewport);
    expect(controller.pointerDown(1, 10, 10)).toBe(false);
    expect(controller.pointerDown(1, 256, 288 - 30)).toBe(true);
    const pressed = input.sample2D(document);
    expect(pressed).toEqual({ pressed: ["pause"], justPressed: ["pause"] });
    expect(session.step(pressed).frame.ui?.nodes.find((node) => node.id === "pause")).toMatchObject({ text: "Resume" });
    expect(input.sample2D(document)).toEqual({ pressed: ["pause"], justPressed: [] });
    controller.pointerUp(1);
    expect(input.sample2D(document)).toEqual({ pressed: [], justPressed: [] });
    session.dispose();
  });

  it("move focus with the D-pad and press with button 0 while focus navigation is on", () => {
    const document = hudWidgetsGame2D();
    const input = new GameInput();
    const controller = new GameUiController(input, measure);
    const button = (id: string, x: number) => ({ kind: "button" as const, id, action: "pause", offset: { x, y: 100 }, width: 40, height: 20 });
    const ui = frame([button("first", 0), button("second", 100)], { focusNavigation: true });
    controller.update(ui, viewport);
    const forwarded = controller.pollGamepads([pad([15, 3])]);
    expect(controller.focusedId).toBe("first");
    expect(forwarded[0]?.buttons.map((entry) => entry.pressed).flatMap((on, index) => on ? [index] : [])).toEqual([3]);
    controller.pollGamepads([pad([])]);
    controller.pollGamepads([pad([15])]);
    expect(controller.focusedId).toBe("second");
    expect(controller.annotate({ ui }).ui?.focusId).toBe("second");
    controller.pollGamepads([pad([0])]);
    input.pollGamepads(controller.pollGamepads([pad([0])]));
    expect(input.sample2D(document)).toEqual({ pressed: ["pause"], justPressed: ["pause"] });
    controller.pollGamepads([pad([])]);
    expect(input.sample2D(document).pressed).toEqual([]);
  });

  it("leave gamepads to the game's bindings when focus navigation is off", () => {
    const controller = new GameUiController(new GameInput(), measure);
    controller.update(frame([{ kind: "button", id: "b", action: "pause", width: 10, height: 10 }]), viewport);
    const pads = [pad([0, 15])];
    expect(controller.pollGamepads(pads)).toBe(pads);
    expect(controller.focusedId).toBeUndefined();
  });
});

describe("HUD capture", () => {
  it("paints the health bar, score panel and pause button in a headless 2D capture", async () => {
    const session = await createScriptedGameSession(hudWidgetsGame2D(), 1);
    const frame = session.step({ pressed: [], justPressed: [] }).frame;
    session.dispose();
    const image = await loadImage(Buffer.from(await captureGameFrame(frame)));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixel = (x: number, y: number): number[] => [...context.getImageData(x, y, 1, 1).data];
    expect([image.width, image.height]).toEqual([512, 288]);
    // The stack starts at (16, 16): an 18-pixel label line, a 6-pixel gap, then the full health bar.
    expect(pixel(16 + 170, 46)).toEqual([0xe0, 0x48, 0x48, 255]);
    expect(pixel(512 - 16 - 130, 16 + 4)).toEqual([0x14, 0x32, 0x5a, 255]);
    expect(pixel(256 - 50, 288 - 16 - 5)).toEqual([0x3a, 0x8a, 0x3a, 255]);
    // The score text draws white pixels inside the panel.
    const panel = context.getImageData(512 - 16 - 140, 16, 140, 40).data;
    expect(panel.some((value, index) => index % 4 === 0 && value > 200 && panel[index + 1] > 200)).toBe(true);
  });
});
