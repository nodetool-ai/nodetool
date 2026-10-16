import type { ResolvedGameInputBindings } from "@nodetool-ai/protocol";
import type { GameInput } from "./input-bindings.js";
import { mountTouchControls, touchLayout, TOUCH_CONTROLS_CSS, type GameTouchControls } from "./touch-controls.js";
import { claimGameUiPointer, type GameUiController } from "./ui/controller.js";
import type { GameUiViewport } from "./ui/layout.js";

export interface GameTouchInputOptions {
  readonly bindings: ResolvedGameInputBindings;
  readonly active: () => boolean;
  readonly hud: GameUiController;
  readonly viewport: () => GameUiViewport | undefined;
}

/** Viewport-local touch controls for React players. Exports use their staged CSP stylesheet. */
export function attachGameTouchInput(canvas: HTMLCanvasElement, input: Pick<GameInput, "setTouch" | "touchLook">,
  options: GameTouchInputOptions): () => void {
  let root: HTMLDivElement | undefined;
  let style: HTMLStyleElement | undefined;
  let controls: GameTouchControls | undefined;
  let observer: ResizeObserver | undefined;
  let previousBounds: Pick<DOMRect, "left" | "top" | "width" | "height"> | undefined;
  const resize = (): void => {
    if (!root) { return; }
    const bounds = canvas.getBoundingClientRect();
    if (previousBounds && (bounds.left !== previousBounds.left || bounds.top !== previousBounds.top ||
      bounds.width !== previousBounds.width || bounds.height !== previousBounds.height)) { controls?.release(); }
    previousBounds = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
    root.hidden = bounds.width <= 0 || bounds.height <= 0;
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.width = `${bounds.width}px`;
    root.style.height = `${bounds.height}px`;
  };
  const enable = (): void => {
    if (root || !options.active()) { return; }
    style = document.createElement("style");
    style.textContent = TOUCH_CONTROLS_CSS;
    document.head.append(style);
    root = document.createElement("div");
    root.className = "touch-layer";
    root.dataset.gameTouchControls = "";
    root.style.inset = "auto";
    document.body.append(root);
    resize();
    controls = mountTouchControls(root, {
      layout: touchLayout(options.bindings), active: options.active,
      onChange: (state) => input.setTouch(state), onLook: (x, y) => input.touchLook(x, y),
      claimPointer: (event) => document.pointerLockElement !== canvas &&
        claimGameUiPointer(canvas, options.hud, options.viewport(), event),
      releasePointer: (id) => options.hud.pointerUp(id)
    });
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    if (canvas.parentElement) { observer.observe(canvas.parentElement); }
  };
  if (window.matchMedia?.("(pointer: coarse)").matches) { enable(); }
  canvas.addEventListener("touchstart", enable, { passive: true });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  // Scrolling changes the canvas position even without a viewport resize.
  window.addEventListener("scroll", resize, { capture: true, passive: true });
  return () => {
    canvas.removeEventListener("touchstart", enable);
    window.removeEventListener("resize", resize);
    window.removeEventListener("orientationchange", resize);
    window.removeEventListener("scroll", resize, { capture: true });
    observer?.disconnect();
    controls?.dispose();
    root?.remove();
    style?.remove();
  };
}
