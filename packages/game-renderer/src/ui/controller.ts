import type { GameUiFrame } from "@nodetool-ai/protocol";
import type { GamepadLike } from "../input-bindings.js";
import { gameUiFont } from "./paint.js";
import { hitGameUiButton, layoutGameUi, nextGameUiFocus, type GameUiBox, type GameUiDirection, type GameUiInsets, type GameUiMeasureText, type GameUiViewport } from "./layout.js";

/** Where HUD button presses go: `GameInput` holds the button's action like a bound control. */
export interface GameUiActionSink {
  pressUiAction(action: string): void;
  releaseUiAction(action: string): void;
}

// Standard gamepad mapping: button 0 confirms, 12 to 15 are the D-pad.
const CONFIRM = 0;
const DPAD: ReadonlyMap<number, GameUiDirection> = new Map([[12, "up"], [13, "down"], [14, "left"], [15, "right"]]);
const FOCUS_KEY = "gamepad";

/**
 * Turns pointer, touch and gamepad input on the HUD into presses of the buttons' input actions.
 * A pressed button holds its action until the pointer lifts or the confirm button is released, so a button
 * reaches the simulation as ordinary input and replays exactly. Focus is presentation and never enters a snapshot.
 */
export class GameUiController {
  private boxes: GameUiBox[] = [];
  private ui: GameUiFrame | undefined;
  private focusId: string | undefined;
  private readonly held = new Map<string | number, string>();
  private readonly padButtons = new Set<number>();
  private insets: GameUiInsets | undefined;

  constructor(private readonly sink: GameUiActionSink, private readonly measure: GameUiMeasureText) {}

  /** Lays out the frame's HUD tree in the HUD rectangle, for hit tests and focus moves until the next frame. */
  update(ui: GameUiFrame | undefined, viewport: GameUiViewport, insets?: GameUiInsets): void {
    this.ui = ui;
    this.insets = insets;
    this.boxes = ui ? layoutGameUi(ui, viewport, this.measure, insets) : [];
    if (this.focusId !== undefined && !this.boxes.some((box) => box.node.kind === "button" && box.node.id === this.focusId)) {
      this.focusId = undefined;
    }
  }

  /** The frame's HUD tree with the focused button and safe-area insets, for the renderer. */
  annotate<F extends { ui?: GameUiFrame }>(frame: F): F {
    if (!frame.ui || (this.focusId === undefined && this.insets === undefined)) { return frame; }
    const ui: GameUiFrame = { ...frame.ui };
    if (this.focusId !== undefined) { ui.focusId = this.focusId; }
    if (this.insets !== undefined) { ui.insets = this.insets; }
    return { ...frame, ui };
  }

  get focusedId(): string | undefined { return this.focusId; }

  /** A pointer went down at a HUD point. Returns true when it landed on a button, which then holds its action. */
  pointerDown(pointerId: number, x: number, y: number): boolean {
    const box = hitGameUiButton(this.boxes, x, y);
    if (!box || box.node.kind !== "button") { return false; }
    this.hold(pointerId, box.node.action);
    return true;
  }

  pointerUp(pointerId: number): void {
    this.releaseKey(pointerId);
  }

  /** Whether the D-pad and confirm button drive the HUD this frame. */
  get navigating(): boolean {
    return this.ui?.focusNavigation === true && this.boxes.some((box) => box.node.kind === "button");
  }

  /**
   * Moves focus with the D-pad and presses the focused button with the confirm button, then returns the pads
   * with those buttons released, so the game's own bindings do not also see them. Without focus navigation the
   * pads pass through unchanged.
   */
  pollGamepads(pads: readonly (GamepadLike | null)[] | null | undefined): readonly (GamepadLike | null)[] {
    const list = pads ?? [];
    if (!this.navigating) {
      this.padButtons.clear();
      this.releaseKey(FOCUS_KEY);
      return list;
    }
    const down = new Set<number>();
    for (const pad of list) {
      if (!pad || pad.connected === false) { continue; }
      for (const index of [CONFIRM, ...DPAD.keys()]) { if (pad.buttons[index]?.pressed) { down.add(index); } }
    }
    for (const [index, direction] of DPAD) {
      if (down.has(index) && !this.padButtons.has(index)) { this.focusId = nextGameUiFocus(this.boxes, this.focusId, direction); }
    }
    if (down.has(CONFIRM) && !this.padButtons.has(CONFIRM)) {
      this.focusId ??= nextGameUiFocus(this.boxes, undefined, "down");
      const focused = this.boxes.find((box) => box.node.id === this.focusId);
      if (focused?.node.kind === "button") { this.hold(FOCUS_KEY, focused.node.action); }
    } else if (!down.has(CONFIRM)) {
      this.releaseKey(FOCUS_KEY);
    }
    this.padButtons.clear();
    for (const index of down) { this.padButtons.add(index); }
    return list.map((pad) => pad && {
      ...pad,
      buttons: pad.buttons.map((button, index) => index === CONFIRM || DPAD.has(index) ? { pressed: false, value: 0 } : button)
    });
  }

  /** Releases everything the HUD holds, as when play pauses or stops. */
  release(): void {
    for (const key of [...this.held.keys()]) { this.releaseKey(key); }
    this.padButtons.clear();
  }

  private hold(key: string | number, action: string): void {
    this.releaseKey(key);
    this.held.set(key, action);
    this.sink.pressUiAction(action);
  }

  private releaseKey(key: string | number): void {
    const action = this.held.get(key);
    if (action === undefined) { return; }
    this.held.delete(key);
    this.sink.releaseUiAction(action);
  }
}

/**
 * Forwards pointer events on `element` that land on HUD buttons to the controller, in HUD pixels.
 * Events that hit a button stop there, so they do not also reach touch look or canvas focus handlers.
 */
export function attachGameUiPointer(element: HTMLElement, controller: GameUiController, viewport: () => GameUiViewport | undefined,
  active: () => boolean = () => true): () => void {
  const down = (event: PointerEvent): void => {
    const size = viewport();
    if (!active()) { return; }
    const rect = element.getBoundingClientRect();
    if (!size || rect.width <= 0 || rect.height <= 0) { return; }
    const x = (event.clientX - rect.left) * size.width / rect.width;
    const y = (event.clientY - rect.top) * size.height / rect.height;
    if (controller.pointerDown(event.pointerId, x, y)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const up = (event: PointerEvent): void => { controller.pointerUp(event.pointerId); };
  element.addEventListener("pointerdown", down);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return () => {
    element.removeEventListener("pointerdown", down);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
}

/**
 * The device safe area where it overlaps `element`, in HUD pixels. Reads the CSS `env(safe-area-inset-*)`
 * values through a probe element, so it is zero on devices without a notch or rounded corners.
 */
export function browserGameUiInsets(element: HTMLElement, viewport: GameUiViewport): GameUiInsets {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const safe = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) { return { top: 0, right: 0, bottom: 0, left: 0 }; }
  const sx = viewport.width / rect.width;
  const sy = viewport.height / rect.height;
  return {
    top: Math.max(0, safe.top - rect.top) * sy,
    right: Math.max(0, rect.right - (window.innerWidth - safe.right)) * sx,
    bottom: Math.max(0, rect.bottom - (window.innerHeight - safe.bottom)) * sy,
    left: Math.max(0, safe.left - rect.left) * sx
  };
}

/** Measures HUD text with an offscreen browser canvas. Without a 2D context, text measures zero wide. */
export function browserGameUiMeasure(gameId: string | undefined): GameUiMeasureText {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) { return () => 0; }
  return (text, size, fontId) => {
    context.font = gameUiFont(size, fontId, gameId);
    return context.measureText(text).width;
  };
}
