// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { GameInput } from "../src/input-bindings.js";
import { mountTouchControls } from "../src/touch-controls.js";
import { gameUiPointerPosition, GameUiController } from "../src/ui/controller.js";

afterEach(() => vi.restoreAllMocks());

function pointer(target: EventTarget, type: string, pointerId: number, x: number, y: number): void {
  const event = new MouseEvent(type, { clientX: x, clientY: y, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerType: { value: "touch" }, pointerId: { value: pointerId } });
  target.dispatchEvent(event);
}

it("gives HUD-only Start buttons under both real touch zones ownership before stick or look", () => {
  const game = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "touch-hud", revision: "draft",
    entrySceneId: "scene", tickRate: 60, presentation: { aspectRatio: 2, hudWidth: 800, hudHeight: 400 },
    inputActions: ["start"], inputAxes: ["moveX", "moveZ"], inputBindings: { actions: { start: [] }, look: [{ kind: "touchDrag" }] }, assets: {},
    scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
    ] }] });
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 400;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 400 } as DOMRect);
  const root = document.createElement("div");
  document.body.append(canvas, root);
  const input = new GameInput();
  const hud = new GameUiController(input, () => 0);
  const viewport = { width: 800, height: 400 };
  hud.update({ safeArea: false, focusNavigation: false, nodes: [
    { kind: "button", id: "left", action: "start", offset: { x: 20, y: 20 }, width: 80, height: 80 },
    { kind: "button", id: "right", action: "start", offset: { x: 600, y: 20 }, width: 80, height: 80 }
  ] }, viewport);
  const touch = mountTouchControls(root, { layout: { stick: true, look: true, buttons: [] },
    onChange: (state) => input.setTouch(state), onLook: (x, y) => input.touchLook(x, y),
    claimPointer: (event) => {
      const point = gameUiPointerPosition(canvas, viewport, event.clientX, event.clientY);
      return point ? hud.pointerDown(event.pointerId, point.x, point.y) : false;
    }, releasePointer: (id) => hud.pointerUp(id) });
  try {
    const zones = [root.querySelector(".touch-stick-zone"), root.querySelector(".touch-look-zone")];
    for (const [index, zone] of zones.entries()) {
      if (!(zone instanceof HTMLElement)) { throw new Error("Actual touch zone is missing"); }
      zone.setPointerCapture = vi.fn();
      root.setPointerCapture = vi.fn();
      const x = index === 0 ? 40 : 620;
      pointer(zone, "pointerdown", index + 1, x, 40);
      const down = input.sample(game);
      expect(down.justPressed).toEqual(["start"]);
      expect(down.axes).toEqual({ moveX: 0, moveZ: 0 });
      pointer(zone, "pointermove", index + 1, x + 50, 90);
      const moved = input.sample(game);
      expect(moved.axes).toEqual({ moveX: 0, moveZ: 0 });
      expect(moved.look).toEqual({ x: 0, y: 0 });
      pointer(window, "pointerup", index + 1, x + 50, 90);
      expect(input.sample(game).pressed).toEqual([]);
    }
  } finally { touch.dispose(); root.remove(); canvas.remove(); }
});
