// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { GameInput } from "../src/input-bindings.js";
import { attachGameMouseInput } from "../src/mouse-input.js";
import { attachGameUiPointer, GameUiController } from "../src/ui/controller.js";

afterEach(() => vi.restoreAllMocks());

function pointer(target: EventTarget, type: string, buttons: number, clientX = 0, clientY = 0): void {
  const event = new MouseEvent(type, { buttons, clientX, clientY, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
  target.dispatchEvent(event);
}

it("lets the actual HUD claim a letterboxed click before an earlier-attached gameplay listener", () => {
  const game = gameDocument.parse({ schemaVersion: 2, engineVersion: "1", pixelsPerUnit: 32, tickRate: 60, id: "mouse-hud", revision: "draft", entrySceneId: "scene",
    inputActions: ["fire", "start"], inputBindings: { actions: { fire: [{ kind: "mouseButton", button: 0 }] } }, assets: {},
    scenes: [{ id: "scene", name: "Scene", entities: [] }] });
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 400;
  canvas.style.objectFit = "contain";
  document.body.append(canvas);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 800 } as DOMRect);
  canvas.setPointerCapture = vi.fn();
  const input = new GameInput();
  const hud = new GameUiController(input, () => 0);
  hud.update({ safeArea: false, focusNavigation: false, nodes: [
    { kind: "button", id: "start", action: "start", offset: { x: 380, y: 20 }, width: 40, height: 40 }
  ] }, { width: 800, height: 400 });
  const detachMouse = attachGameMouseInput(canvas, input, { active: () => true });
  // Listener order deliberately opposes HUD priority, as it can in a mounted React viewport.
  const detachHud = attachGameUiPointer(canvas, hud, () => ({ width: 800, height: 400 }));
  try {
    pointer(canvas, "pointerdown", 1, 400, 240);
    expect(input.sample2D(game).justPressed).toEqual(["start"]);
    pointer(canvas, "pointermove", 3, 400, 240);
    expect(input.sample2D(game).pressed).toEqual(["start"]);
    pointer(window, "pointerup", 0);
    expect(input.sample2D(game).pressed).toEqual([]);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
    pointer(canvas, "pointerdown", 1, 100, 400);
    expect(input.sample2D(game).justPressed).toEqual(["fire"]);
  } finally { detachMouse(); detachHud(); canvas.remove(); }
});

it.each([[1, 0], [2, 2], [4, 1], [8, 3], [16, 4]])("maps DOM buttons bit %i to physical button %i", (mask, button) => {
  const canvas = document.createElement("canvas");
  const down = vi.fn();
  const up = vi.fn();
  const detach = attachGameMouseInput(canvas, { mouseDown: down, mouseUp: up, release() {}, look() {} }, { active: () => true });
  try {
    pointer(canvas, "pointerdown", mask);
    expect(down).toHaveBeenCalledExactlyOnceWith(button);
    pointer(window, "pointerup", 0);
    expect(up).toHaveBeenCalledExactlyOnceWith(button);
  } finally { detach(); }
});
