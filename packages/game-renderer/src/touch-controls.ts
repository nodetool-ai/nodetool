import type { ResolvedGameInputBindings } from "@nodetool-ai/protocol";
import type { TouchInputState } from "./input-bindings.js";

// sin(22.5°): an axis turns on once the stick leans past the edge of its 45° sector, which gives 8-way input.
const AXIS_THRESHOLD = 0.38;

/** Maps a stick offset in screen pixels (y grows downward) to the direction actions it presses. */
export function stickActions(dx: number, dy: number, deadZone: number): string[] {
  const length = Math.hypot(dx, dy);
  if (!(length > deadZone)) {
    return [];
  }
  const x = dx / length;
  const y = -dy / length;
  const actions: string[] = [];
  if (x < -AXIS_THRESHOLD) actions.push("left");
  if (x > AXIS_THRESHOLD) actions.push("right");
  if (y > AXIS_THRESHOLD) actions.push("up");
  if (y < -AXIS_THRESHOLD) actions.push("down");
  return actions;
}

export interface TouchLayout {
  /** Whether any action or axis reads the floating stick. */
  readonly stick: boolean;
  /** One button per action with a touch button binding, in action order. */
  readonly buttons: readonly { readonly action: string; readonly label: string }[];
  /** Whether a drag on the right half turns the camera. */
  readonly look: boolean;
}

/** Derives the on-screen controls from a document's resolved input bindings. */
export function touchLayout(bindings: ResolvedGameInputBindings): TouchLayout {
  const buttons: { action: string; label: string }[] = [];
  for (const { action, bindings: list } of bindings.actions) {
    const button = list.find((binding) => binding.kind === "touchButton");
    if (button) { buttons.push({ action, label: button.label ?? action.toUpperCase() }); }
  }
  return {
    stick: bindings.actions.some(({ bindings: list }) => list.some((binding) => binding.kind === "touchStick")) ||
      bindings.axes.some(({ bindings: list }) => list.some((binding) => binding.kind === "touchStick")),
    buttons,
    look: bindings.look.some((binding) => binding.kind === "touchDrag")
  };
}

export interface TouchControlsOptions {
  readonly layout: TouchLayout;
  /** Called with everything touch currently holds. */
  readonly onChange: (state: TouchInputState) => void;
  /** Called with drag movement in pixels on the look zone. */
  readonly onLook?: (x: number, y: number) => void;
}

/** Styles for the touch layer, for players whose page does not already define them. */
export const TOUCH_CONTROLS_CSS = ".touch-layer{position:fixed;inset:0;z-index:2;pointer-events:none}" +
  ".touch-stick-zone{position:absolute;left:0;top:0;bottom:0;width:50%;pointer-events:auto;touch-action:none}" +
  ".touch-look-zone{position:absolute;right:0;top:0;bottom:0;width:50%;pointer-events:auto;touch-action:none}" +
  ".touch-stick{position:absolute;left:25%;top:70%;width:7.5rem;height:7.5rem;margin:-3.75rem 0 0 -3.75rem;border-radius:50%;border:2px solid #fff5;background:#fff1;opacity:.35;transition:opacity .15s}" +
  ".touch-stick.active{opacity:.9}" +
  ".touch-knob{position:absolute;left:50%;top:50%;width:3.25rem;height:3.25rem;margin:-1.625rem 0 0 -1.625rem;border-radius:50%;background:#fff8;box-shadow:0 0 1rem #fff6}" +
  ".touch-buttons{position:absolute;right:max(1.25rem,env(safe-area-inset-right));bottom:max(1.25rem,env(safe-area-inset-bottom));display:flex;flex-direction:column-reverse;gap:1rem;pointer-events:auto}" +
  ".touch-button{width:5.25rem;height:5.25rem;border-radius:50%;border:2px solid #fff6;background:#ffffff1f;color:#fff;font:600 .8rem system-ui,sans-serif;letter-spacing:.05em;touch-action:none;box-shadow:0 0 1.25rem #0008}" +
  ".touch-button.active{background:#ffffff59;transform:scale(.94)}";

/**
 * A floating stick on the left half of the screen and action buttons on the right.
 * The stick appears where the thumb lands, so it works for any hand position.
 */
export function mountTouchControls(root: HTMLElement, options: TouchControlsOptions): () => void {
  const { layout } = options;
  let stick: { x: number; y: number } | undefined;
  const held = new Set<string>();
  const emit = (): void => { options.onChange({ stick, buttons: new Set(held) }); };
  const cleanups: Array<() => void> = [];
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void): void => {
    target.addEventListener(type, handler, { passive: false });
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  if (layout.look && options.onLook) {
    const onLook = options.onLook;
    const zone = document.createElement("div");
    zone.className = "touch-look-zone";
    root.append(zone);
    let pointerId: number | undefined;
    let lastX = 0;
    let lastY = 0;
    const end = (event: PointerEvent): void => { if (event.pointerId === pointerId) pointerId = undefined; };
    listen(zone, "pointerdown", (event) => {
      event.preventDefault();
      if (pointerId !== undefined) return;
      pointerId = event.pointerId;
      zone.setPointerCapture(event.pointerId);
      lastX = event.clientX;
      lastY = event.clientY;
    });
    listen(zone, "pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      onLook(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    });
    listen(zone, "pointerup", end);
    listen(zone, "pointercancel", end);
  }

  if (layout.stick) {
    const zone = document.createElement("div");
    zone.className = "touch-stick-zone";
    const base = document.createElement("div");
    base.className = "touch-stick";
    const knob = document.createElement("div");
    knob.className = "touch-knob";
    base.append(knob);
    zone.append(base);
    root.append(zone);
    let pointerId: number | undefined;
    let originX = 0;
    let originY = 0;
    const radius = (): number => base.offsetWidth / 2 || 56;
    const move = (event: PointerEvent): void => {
      const limit = radius();
      let dx = event.clientX - originX;
      let dy = event.clientY - originY;
      const length = Math.hypot(dx, dy);
      if (length > limit) {
        dx = (dx / length) * limit;
        dy = (dy / length) * limit;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      stick = { x: dx / limit, y: dy / limit };
      emit();
    };
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      base.classList.remove("active");
      knob.style.transform = "";
      stick = undefined;
      emit();
    };
    listen(zone, "pointerdown", (event) => {
      event.preventDefault();
      if (pointerId !== undefined) return;
      pointerId = event.pointerId;
      zone.setPointerCapture(event.pointerId);
      originX = event.clientX;
      originY = event.clientY;
      const bounds = zone.getBoundingClientRect();
      base.style.left = `${originX - bounds.left}px`;
      base.style.top = `${originY - bounds.top}px`;
      base.classList.add("active");
      move(event);
    });
    listen(zone, "pointermove", (event) => {
      if (event.pointerId === pointerId) move(event);
    });
    listen(zone, "pointerup", release);
    listen(zone, "pointercancel", release);
  }

  const buttons = document.createElement("div");
  buttons.className = "touch-buttons";
  for (const { action, label } of layout.buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "touch-button";
    button.textContent = label;
    button.setAttribute("aria-label", action);
    const up = (): void => {
      button.classList.remove("active");
      held.delete(action);
      emit();
    };
    listen(button, "pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add("active");
      held.add(action);
      emit();
    });
    listen(button, "pointerup", up);
    listen(button, "pointercancel", up);
    listen(button, "contextmenu", (event) => event.preventDefault());
    buttons.append(button);
  }
  root.append(buttons);
  return () => {
    cleanups.forEach((cleanup) => cleanup());
    root.replaceChildren();
    held.clear();
    stick = undefined;
  };
}
