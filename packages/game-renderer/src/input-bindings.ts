import {
  resolveGameInputBindings, type GameDocument, type GameDocument3D, type GameInputAxisBinding, type GameInputBinding,
  type GameInputFrame, type GameInputFrame3D, type ResolvedGameInputBindings
} from "@nodetool-ai/protocol";
import { stickActions } from "./touch-controls.js";

/** The parts of the browser `Gamepad` the sampler reads. */
export interface GamepadLike {
  readonly connected?: boolean;
  readonly buttons: readonly { readonly pressed: boolean; readonly value?: number }[];
  readonly axes: readonly number[];
}

/** What touch controls hold: a stick offset normalised to the stick radius (y grows downward) and held button actions. */
export interface TouchInputState {
  readonly stick?: { readonly x: number; readonly y: number };
  readonly buttons: ReadonlySet<string>;
}

/** The connected gamepads, or none where the Gamepad API is missing or blocked by permissions policy. */
export function browserGamepads(): readonly (GamepadLike | null)[] {
  try {
    return typeof navigator !== "undefined" && typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  } catch {
    // A permissions policy that blocks "gamepad" makes getGamepads throw; play continues without gamepads.
    return [];
  }
}

// The stick turns on past a quarter of its radius, as the 2D touch stick always has.
const TOUCH_STICK_DEAD_ZONE = 0.25;
const EMPTY_TOUCH: TouchInputState = { buttons: new Set() };

function deadZoned(value: number, deadZone: number): number {
  if (!Number.isFinite(value)) { return 0; }
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) { return 0; }
  return Math.sign(value) * Math.min(1, (magnitude - deadZone) / (1 - deadZone));
}

/** Negates without producing -0, so an idle frame reads exactly zero. */
function flip(value: number, invert: boolean): number {
  return invert && value !== 0 ? -value : value;
}

/**
 * Turns physical keyboard, mouse, gamepad and touch input into input frames through a document's
 * input bindings. Physical input is sampled once per simulation tick, and edges and look deltas are
 * consumed by the sample. While disabled (paused play), input is dropped instead of queued.
 */
export class GameInput {
  private readonly keys = new Set<string>();
  private readonly newSources = new Set<string>();
  private readonly previousPressed = new Set<string>();
  private readonly gamepadButtons = new Set<number>();
  private gamepadAxes: number[] = [];
  private touch: TouchInputState = EMPTY_TOUCH;
  private mouseX = 0;
  private mouseY = 0;
  private touchX = 0;
  private touchY = 0;
  private enabled = true;

  /** Disabling releases everything held and ignores input until enabled again. */
  setEnabled(enabled: boolean): void {
    if (!enabled) { this.release(); }
    this.enabled = enabled;
  }

  /** `code` is a `KeyboardEvent.code`. `Mouse<n>` is accepted for mouse button n. */
  keyDown(code: string): void {
    if (!this.enabled) { return; }
    if (!this.keys.has(code)) { this.newSources.add(`key:${code}`); }
    this.keys.add(code);
  }

  keyUp(code: string): void { this.keys.delete(code); }

  mouseDown(button: number): void { this.keyDown(`Mouse${button}`); }

  mouseUp(button: number): void { this.keyUp(`Mouse${button}`); }

  /** Mouse movement in pixels, accumulated until the next sample. */
  look(x: number, y: number): void {
    if (!this.enabled) { return; }
    this.mouseX += x;
    this.mouseY += y;
  }

  /** Touch drag movement in pixels, accumulated until the next sample. */
  touchLook(x: number, y: number): void {
    if (!this.enabled) { return; }
    this.touchX += x;
    this.touchY += y;
  }

  setTouch(state: TouchInputState): void {
    if (!this.enabled) { return; }
    for (const action of state.buttons) {
      if (!this.touch.buttons.has(action)) { this.newSources.add(`touch:${action}`); }
    }
    this.touch = state;
  }

  /** Reads every connected gamepad. Call once per tick with `navigator.getGamepads()`. */
  pollGamepads(pads: readonly (GamepadLike | null)[] | null | undefined): void {
    const buttons = new Set<number>();
    const axes: number[] = [];
    if (this.enabled) {
      for (const pad of pads ?? []) {
        if (!pad || pad.connected === false) { continue; }
        pad.buttons.forEach((button, index) => { if (button.pressed) { buttons.add(index); } });
        pad.axes.forEach((value, index) => {
          if (Number.isFinite(value) && Math.abs(value) > Math.abs(axes[index] ?? 0)) { axes[index] = value; }
        });
      }
    }
    for (const button of buttons) {
      if (!this.gamepadButtons.has(button)) { this.newSources.add(`gamepad:${button}`); }
    }
    this.gamepadButtons.clear();
    buttons.forEach((button) => this.gamepadButtons.add(button));
    this.gamepadAxes = axes;
  }

  release(): void {
    this.keys.clear();
    this.newSources.clear();
    this.previousPressed.clear();
    this.gamepadButtons.clear();
    this.gamepadAxes = [];
    this.touch = EMPTY_TOUCH;
    this.mouseX = 0;
    this.mouseY = 0;
    this.touchX = 0;
    this.touchY = 0;
  }

  /** Whether a key is bound in this document, so the host can stop the browser's default action. */
  handlesKey(document: GameDocument | GameDocument3D, code: string): boolean {
    const bindings = resolveGameInputBindings(document);
    return bindings.actions.some(({ bindings: list }) => list.some((binding) => binding.kind === "key" && binding.code === code)) ||
      bindings.axes.some(({ bindings: list }) => list.some((binding) => binding.kind === "keys" && (binding.negative.includes(code) || binding.positive.includes(code))));
  }

  sample(document: GameDocument3D): GameInputFrame3D {
    const bindings = resolveGameInputBindings(document);
    const { pressed, justPressed } = this.sampleActions(bindings);
    const axes = Object.fromEntries(bindings.axes.map(({ axis, bindings: list }) => [axis, this.axisValue(list)]));
    const look = this.sampleLook(bindings);
    this.consume();
    return { pressed, justPressed, axes, look };
  }

  sample2D(document: GameDocument): GameInputFrame {
    const frame = this.sampleActions(resolveGameInputBindings(document));
    this.consume();
    return frame;
  }

  private consume(): void {
    this.newSources.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.touchX = 0;
    this.touchY = 0;
  }

  private sampleActions(bindings: ResolvedGameInputBindings): { pressed: string[]; justPressed: string[] } {
    const pressed: string[] = [];
    const justPressed: string[] = [];
    for (const { action, bindings: list } of bindings.actions) {
      const held = list.some((binding) => this.held(binding, action));
      if (held) { pressed.push(action); }
      // A digital control pressed since the last sample is an edge even if it was released again.
      // Analog and touch-stick controls produce an edge when the action turns on.
      if (list.some((binding) => this.newSources.has(this.sourceOf(binding, action))) || (held && !this.previousPressed.has(action))) {
        justPressed.push(action);
      }
    }
    this.previousPressed.clear();
    pressed.forEach((action) => this.previousPressed.add(action));
    return { pressed, justPressed };
  }

  private sourceOf(binding: GameInputBinding, action: string): string {
    switch (binding.kind) {
      case "key": return `key:${binding.code}`;
      case "mouseButton": return `key:Mouse${binding.button}`;
      case "gamepadButton": return `gamepad:${binding.button}`;
      case "touchButton": return `touch:${action}`;
      default: return "";
    }
  }

  private held(binding: GameInputBinding, action: string): boolean {
    switch (binding.kind) {
      case "key": return this.keys.has(binding.code);
      case "mouseButton": return this.keys.has(`Mouse${binding.button}`);
      case "gamepadButton": return this.gamepadButtons.has(binding.button);
      case "gamepadAxis": {
        const value = this.gamepadAxes[binding.axis] ?? 0;
        return binding.direction === "positive" ? value >= binding.threshold : value <= -binding.threshold;
      }
      case "touchButton": return this.touch.buttons.has(action);
      case "touchStick": {
        const stick = this.touch.stick;
        return stick !== undefined && stickActions(stick.x, stick.y, TOUCH_STICK_DEAD_ZONE).includes(binding.direction);
      }
    }
  }

  private axisValue(bindings: readonly GameInputAxisBinding[]): number {
    let result = 0;
    for (const binding of bindings) {
      const value = this.axisBindingValue(binding);
      if (Math.abs(value) > Math.abs(result)) { result = value; }
    }
    return Math.max(-1, Math.min(1, result));
  }

  private axisBindingValue(binding: GameInputAxisBinding): number {
    switch (binding.kind) {
      case "keys":
        return Number(binding.positive.some((code) => this.keys.has(code))) - Number(binding.negative.some((code) => this.keys.has(code)));
      case "gamepadAxis": return flip(deadZoned(this.gamepadAxes[binding.axis] ?? 0, binding.deadZone), binding.invert);
      case "gamepadButtons": return Number(this.gamepadButtons.has(binding.positive)) - Number(this.gamepadButtons.has(binding.negative));
      case "touchStick": {
        const stick = this.touch.stick;
        if (!stick || !(Math.hypot(stick.x, stick.y) > TOUCH_STICK_DEAD_ZONE)) { return 0; }
        return flip(Math.max(-1, Math.min(1, binding.axis === "x" ? stick.x : stick.y)), binding.invert);
      }
    }
  }

  private sampleLook(bindings: ResolvedGameInputBindings): { x: number; y: number } {
    let x = 0;
    let y = 0;
    // Each term is added only when it is non-zero, so an idle source never turns a pixel delta into a rounded sum.
    const add = (dx: number, dy: number): void => {
      if (dx !== 0) { x = x === 0 ? dx : x + dx; }
      if (dy !== 0) { y = y === 0 ? dy : y + dy; }
    };
    for (const binding of bindings.look) {
      if (binding.kind === "mouse") { add(this.mouseX * binding.sensitivity, flip(this.mouseY * binding.sensitivity, binding.invertY)); }
      else if (binding.kind === "touchDrag") { add(this.touchX * binding.sensitivity, flip(this.touchY * binding.sensitivity, binding.invertY)); }
      else {
        add(deadZoned(this.gamepadAxes[binding.xAxis] ?? 0, binding.deadZone) * binding.speed,
          flip(deadZoned(this.gamepadAxes[binding.yAxis] ?? 0, binding.deadZone) * binding.speed, binding.invertY));
      }
    }
    return { x, y };
  }
}
