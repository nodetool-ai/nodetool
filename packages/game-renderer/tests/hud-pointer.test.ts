import { afterEach, describe, expect, it, vi } from "vitest";
import { attachGameUiPointer, GameUiController } from "../src/ui/controller.js";

class HudCanvas extends EventTarget {
  width = 800;
  height = 400;
  bounds = { left: 0, top: 0, width: 800, height: 800 };
  getBoundingClientRect() { return this.bounds; }
}

function pointer(target: EventTarget, type: string, x: number, y: number): void {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(event, { pointerId: 1, clientX: x, clientY: y });
  target.dispatchEvent(event);
}

afterEach(() => vi.unstubAllGlobals());

describe("HUD pointer content coordinates", () => {
  it.each([
    { backing: [800, 400], css: [800, 800], bar: [400, 80], points: [[20, 220], [780, 220], [20, 580], [780, 580]] },
    { backing: [800, 400], css: [1200, 800], bar: [600, 40], points: [[30, 130], [1170, 130], [30, 670], [1170, 670]] },
    { backing: [400, 800], css: [800, 800], bar: [80, 400], points: [[220, 20], [580, 20], [220, 780], [580, 780]] }
  ])("hits all four controls with backing $backing in CSS $css", ({ backing, css, bar, points }) => {
    const canvas = new HudCanvas();
    [canvas.width, canvas.height] = backing;
    [canvas.bounds.width, canvas.bounds.height] = css;
    const windowEvents = new EventTarget();
    vi.stubGlobal("window", windowEvents);
    vi.stubGlobal("HTMLCanvasElement", HudCanvas);
    vi.stubGlobal("getComputedStyle", () => ({ objectFit: "contain" }));
    const press = vi.fn();
    const controller = new GameUiController({ pressUiAction: press, releaseUiAction: vi.fn() }, () => 0);
    const size = { width: canvas.width, height: canvas.height };
    const corners = [[0, 0], [size.width - 40, 0], [0, size.height - 40], [size.width - 40, size.height - 40]];
    controller.update({ safeArea: false, focusNavigation: false, nodes: corners.map(([x, y], index) => ({
      kind: "button", id: `corner-${index}`, action: `corner-${index}`, offset: { x, y }, width: 40, height: 40
    })) }, size);
    const detach = attachGameUiPointer(canvas as unknown as HTMLElement, controller, () => size);
    for (const [index, [x, y]] of points.entries()) {
      pointer(canvas, "pointerdown", x, y);
      expect(press).toHaveBeenLastCalledWith(`corner-${index}`);
      pointer(windowEvents, "pointerup", x, y);
    }
    pointer(canvas, "pointerdown", bar[0], bar[1]);
    expect(press).toHaveBeenCalledTimes(4);
    // Geometry is read at each event, rather than cached before a resize/orientation change.
    canvas.bounds = { left: 100, top: 40, width: canvas.width, height: canvas.height };
    pointer(canvas, "pointerdown", 120, 60);
    expect(press).toHaveBeenNthCalledWith(5, "corner-0");
    detach();
  });

  it("hits the rendered button under contain and rejects its upper letterbox", () => {
    const canvas = new HudCanvas();
    const windowEvents = new EventTarget();
    vi.stubGlobal("window", windowEvents);
    vi.stubGlobal("getComputedStyle", () => ({ objectFit: "contain", objectPosition: "50% 50%" }));
    const press = vi.fn();
    const controller = new GameUiController({ pressUiAction: press, releaseUiAction: vi.fn() }, () => 0);
    controller.update({ safeArea: false, focusNavigation: false, nodes: [
      { kind: "button", id: "start", action: "start", offset: { x: 380, y: 20 }, width: 40, height: 40 }
    ] }, { width: 800, height: 400 });
    // The actual handler receives an element with the same backing/CSS geometry as the React host.
    const detach = attachGameUiPointer(canvas as unknown as HTMLElement, controller, () => ({ width: 800, height: 400 }));
    pointer(canvas, "pointerdown", 400, 240);
    expect(press).toHaveBeenCalledExactlyOnceWith("start");
    pointer(windowEvents, "pointerup", 400, 240);
    press.mockClear();
    pointer(canvas, "pointerdown", 400, 80);
    expect(press).not.toHaveBeenCalled();
    detach();
  });
});
