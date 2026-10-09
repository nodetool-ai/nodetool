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

/** Keys that a `key` binding names by code. Such a key never also matches a `keyValue` binding. */
function boundCodes(bindings: ResolvedGameInputBindings): Set<string> {
  const codes = new Set<string>();
  for (const { bindings: list } of bindings.actions) {
    for (const binding of list) { if (binding.kind === "key") { codes.add(binding.code); } }
  }
  return codes;
}

/**
 * Turns physical keyboard, mouse, gamepad and touch input into input frames through a document's
 * input bindings. Physical input is sampled once per simulation tick, and edges and look deltas are
 * consumed by the sample. While disabled (paused play), input is dropped instead of queued.
 */
export class GameInput {
  // Held keys by `KeyboardEvent.code`, with the lowercase key value at keydown and the press stamp.
  private readonly keys = new Map<string, { readonly value?: string; readonly since: number }>();
  // Digital sources pressed since the last sample, with the stamp of their first press.
  private readonly newSources = new Map<string, number>();
  // Key values of keys pressed since the last sample, so a quick tap still produces an edge.
  private readonly newKeyValues = new Map<string, string>();
  private readonly previousPressed = new Map<string, number>();
  private readonly gamepadButtons = new Map<number, number>();
  private readonly touchSince = new Map<string, number>();
  private gamepadAxes: number[] = [];
  private touch: TouchInputState = EMPTY_TOUCH;
  private stickSince: number | undefined;
  private mouseX = 0;
  private mouseY = 0;
  private touchX = 0;
  private touchY = 0;
  private enabled = true;
  // Orders presses, so 2D frames list actions in the order they were pressed.
  private clock = 0;

  /** Disabling releases everything held and ignores input until enabled again. */
  setEnabled(enabled: boolean): void {
    if (!enabled) { this.release(); }
    this.enabled = enabled;
  }

  /** `code` is a `KeyboardEvent.code` and `key` its `KeyboardEvent.key`. `Mouse<n>` is accepted for mouse button n. */
  keyDown(code: string, key?: string): void {
    if (!this.enabled || this.keys.has(code)) { return; }
    const since = ++this.clock;
    const value = key?.toLowerCase();
    this.keys.set(code, { value, since });
    if (!this.newSources.has(`key:${code}`)) { this.newSources.set(`key:${code}`, since); }
    if (value !== undefined) { this.newKeyValues.set(code, value); }
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
    // The stick counts as pressed when the thumb lands, before buttons the same touch update holds.
    if (!state.stick) { this.stickSince = undefined; }
    else if (this.stickSince === undefined) { this.stickSince = ++this.clock; }
    for (const action of state.buttons) {
      if (this.touchSince.has(action)) { continue; }
      const since = ++this.clock;
      this.touchSince.set(action, since);
      if (!this.newSources.has(`touch:${action}`)) { this.newSources.set(`touch:${action}`, since); }
    }
    for (const action of [...this.touchSince.keys()]) {
      if (!state.buttons.has(action)) { this.touchSince.delete(action); }
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
    for (const button of [...this.gamepadButtons.keys()]) {
      if (!buttons.has(button)) { this.gamepadButtons.delete(button); }
    }
    for (const button of buttons) {
      if (this.gamepadButtons.has(button)) { continue; }
      const since = ++this.clock;
      this.gamepadButtons.set(button, since);
      if (!this.newSources.has(`gamepad:${button}`)) { this.newSources.set(`gamepad:${button}`, since); }
    }
    this.gamepadAxes = axes;
  }

  release(): void {
    this.keys.clear();
    this.newSources.clear();
    this.newKeyValues.clear();
    this.previousPressed.clear();
    this.gamepadButtons.clear();
    this.touchSince.clear();
    this.gamepadAxes = [];
    this.touch = EMPTY_TOUCH;
    this.stickSince = undefined;
    this.mouseX = 0;
    this.mouseY = 0;
    this.touchX = 0;
    this.touchY = 0;
  }

  /** Whether a key is bound in this document, so the host can stop the browser's default action. */
  handlesKey(document: GameDocument | GameDocument3D, code: string, key?: string): boolean {
    const bindings = resolveGameInputBindings(document);
    const value = key?.toLowerCase();
    const matchesValue = value !== undefined && !boundCodes(bindings).has(code);
    return bindings.actions.some(({ bindings: list }) => list.some((binding) =>
      (binding.kind === "key" && binding.code === code) || (matchesValue && binding.kind === "keyValue" && binding.key.toLowerCase() === value))) ||
      bindings.axes.some(({ bindings: list }) => list.some((binding) => binding.kind === "keys" && (binding.negative.includes(code) || binding.positive.includes(code))));
  }

  sample(document: GameDocument3D): GameInputFrame3D {
    const bindings = resolveGameInputBindings(document);
    const { pressed, justPressed } = this.sampleActions(bindings, false);
    const axes = Object.fromEntries(bindings.axes.map(({ axis, bindings: list }) => [axis, this.axisValue(list)]));
    const look = this.sampleLook(bindings);
    this.consume();
    return { pressed, justPressed, axes, look };
  }

  /** 2D frames list actions in press order, as the fixed 2D key mapping did. */
  sample2D(document: GameDocument): GameInputFrame {
    const frame = this.sampleActions(resolveGameInputBindings(document), true);
    this.consume();
    return frame;
  }

  private consume(): void {
    this.newSources.clear();
    this.newKeyValues.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.touchX = 0;
    this.touchY = 0;
  }

  private sampleActions(bindings: ResolvedGameInputBindings, pressOrder: boolean): { pressed: string[]; justPressed: string[] } {
    const codes = boundCodes(bindings);
    const sampledAt = ++this.clock;
    const previous = new Map(this.previousPressed);
    this.previousPressed.clear();
    const pressed: { action: string; since: number }[] = [];
    const justPressed: { action: string; since: number }[] = [];
    for (const { action, bindings: list } of bindings.actions) {
      let held = Infinity;
      let fresh = Infinity;
      for (const binding of list) {
        const since = this.heldSince(binding, action, codes);
        // An action held by analog input is ordered from the first sample that saw it on.
        held = Math.min(held, since === "analog" ? previous.get(action) ?? sampledAt : since ?? Infinity);
        fresh = Math.min(fresh, this.pressedSince(binding, action, codes) ?? Infinity);
      }
      if (held !== Infinity) {
        pressed.push({ action, since: held });
        this.previousPressed.set(action, held);
      }
      // A digital control pressed since the last sample is an edge even if it was released again.
      // Analog and touch-stick controls produce an edge when the action turns on.
      if (fresh !== Infinity || (held !== Infinity && !previous.has(action))) {
        justPressed.push({ action, since: fresh !== Infinity ? fresh : held });
      }
    }
    const order = (entries: { action: string; since: number }[]): string[] =>
      (pressOrder ? [...entries].sort((left, right) => left.since - right.since) : entries).map((entry) => entry.action);
    return { pressed: order(pressed), justPressed: order(justPressed) };
  }

  /** The press stamp of a held digital control, "analog" for a held analog control, or undefined when it is not held. */
  private heldSince(binding: GameInputBinding, action: string, codes: ReadonlySet<string>): number | "analog" | undefined {
    switch (binding.kind) {
      case "key": return this.keys.get(binding.code)?.since;
      case "keyValue": {
        const value = binding.key.toLowerCase();
        let since: number | undefined;
        for (const [code, held] of this.keys) {
          if (held.value === value && !codes.has(code)) { since = Math.min(since ?? Infinity, held.since); }
        }
        return since;
      }
      case "mouseButton": return this.keys.get(`Mouse${binding.button}`)?.since;
      case "gamepadButton": return this.gamepadButtons.get(binding.button);
      case "gamepadAxis": {
        const value = this.gamepadAxes[binding.axis] ?? 0;
        return (binding.direction === "positive" ? value >= binding.threshold : value <= -binding.threshold) ? "analog" : undefined;
      }
      case "touchButton": return this.touchSince.get(action);
      case "touchStick": {
        const stick = this.touch.stick;
        return stick !== undefined && stickActions(stick.x, stick.y, TOUCH_STICK_DEAD_ZONE).includes(binding.direction) ? this.stickSince : undefined;
      }
    }
  }

  /** The first press stamp of a digital control pressed since the last sample. */
  private pressedSince(binding: GameInputBinding, action: string, codes: ReadonlySet<string>): number | undefined {
    switch (binding.kind) {
      case "key": return this.newSources.get(`key:${binding.code}`);
      case "keyValue": {
        const value = binding.key.toLowerCase();
        let since: number | undefined;
        for (const [code, pressedValue] of this.newKeyValues) {
          const stamp = this.newSources.get(`key:${code}`);
          if (pressedValue === value && !codes.has(code) && stamp !== undefined) { since = Math.min(since ?? Infinity, stamp); }
        }
        return since;
      }
      case "mouseButton": return this.newSources.get(`key:Mouse${binding.button}`);
      case "gamepadButton": return this.newSources.get(`gamepad:${binding.button}`);
      case "touchButton": return this.newSources.get(`touch:${action}`);
      default: return undefined;
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
