import { nativeRuntimeInput } from "@nodetool-ai/protocol/native-game";

export interface NativeInputEdge { readonly action: string; readonly pressed: boolean; readonly sequence: number }
export interface NativeRecordedInput { readonly tick: number; readonly generation: number; readonly input: Readonly<Record<string, unknown>> }
/** Records committed input, including loaded JSON responses, without retaining DOM events or mutable views. */
export class NativeInputRecording {
  private readonly recorded: NativeRecordedInput[] = [];
  private bytes = 0;
  private reservation: object | undefined;
  constructor(private readonly maxTicks = 100_000, private readonly maxBytes = 16 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxTicks) || maxTicks < 1 || maxTicks > 100_000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) { throw new Error("Invalid native input recording limits"); }
  }
  record(entry: NativeRecordedInput): void {
    this.prepare(entry).commit();
  }
  /** Reserve capacity before stepping. Failed ticks cancel the reservation and never enter replay. */
  prepare(entry: NativeRecordedInput): { commit(): void; cancel(): void } {
    if (this.reservation) { throw new Error("Native input recording already has a pending tick"); }
    if (!Number.isSafeInteger(entry.tick) || entry.tick < 0 || !Number.isSafeInteger(entry.generation) || entry.generation < 1) { throw new Error("Invalid native recorded input identity"); }
    const previous = this.recorded.at(-1);
    if (previous && (entry.generation < previous.generation || (entry.generation === previous.generation && entry.tick <= previous.tick))) { throw new Error("Native recorded inputs must follow committed tick order"); }
    const input = nativeRuntimeInput.parse(entry.input);
    const copy = { generation: entry.generation, tick: entry.tick, input: structuredClone(input) };
    const bytes = new TextEncoder().encode(JSON.stringify(copy)).byteLength;
    if (this.recorded.length >= this.maxTicks || bytes > this.maxBytes - this.bytes) { throw new Error("Native input recording is full"); }
    const reservation = {}; this.reservation = reservation;
    return {
      commit: () => {
        if (this.reservation !== reservation) { throw new Error("Native input recording reservation is stale"); }
        this.recorded.push(copy); this.bytes += bytes; this.reservation = undefined;
      },
      cancel: () => { if (this.reservation === reservation) { this.reservation = undefined; } }
    };
  }
  entries(): readonly NativeRecordedInput[] { return structuredClone(this.recorded); }
  get length(): number { return this.recorded.length; }
  clear(): void { this.recorded.length = 0; this.bytes = 0; this.reservation = undefined; }
}
/** Multiple edges between ticks retain their order, even a quick press and release. */
export class NativeBrowserInput {
  private readonly held = new Map<string, number | boolean>();
  private readonly digitalPresses = new Set<string>();
  private readonly edges: NativeInputEdge[] = [];
  private sequence = 0;
  private lookX = 0;
  private lookY = 0;
  private pointer: { x: number; y: number; down: boolean } | undefined;
  constructor(private readonly dimension: "2d" | "3d" = "3d") {}
  set(action: string, value: number | boolean): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u.test(action) || ["__proto__", "constructor", "prototype"].includes(action)) { throw new Error("Invalid native input action"); }
    const amount = typeof value === "boolean" ? Number(value) : value;
    if (!Number.isFinite(amount) || Math.abs(amount) > 1) { throw new Error("Native action value must be between -1 and 1"); }
    const before = this.held.get(action) ?? 0;
    if (!this.held.has(action) && this.held.size >= 256) { throw new Error("Native input action limit reached"); }
    if (Boolean(before) !== Boolean(amount)) {
      if (this.edges.length >= 256) { throw new Error("Native input edge queue is full"); }
      this.edges.push({ action, pressed: Boolean(amount), sequence: this.sequence++ });
    }
    if (value === true && before !== true) { this.digitalPresses.add(action); }
    if (typeof value === "number") { this.digitalPresses.delete(action); }
    this.held.set(action, value);
  }
  setPointer(x: number, y: number, down: boolean): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { throw new Error("Invalid native pointer coordinates"); }
    this.pointer = { x, y, down };
  }
  addLook(x: number, y: number): void {
    if (this.dimension !== "3d") { return; }
    const nextX = this.lookX + x, nextY = this.lookY + y;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(nextX) > 1_000_000 || Math.abs(nextY) > 1_000_000) { throw new Error("Native look input limit reached"); }
    this.lookX = nextX; this.lookY = nextY;
  }
  releaseAll(): void {
    this.lookX = 0; this.lookY = 0;
    for (const [action, value] of this.held) { if (value) { this.set(action, typeof value === "boolean" ? false : 0); } }
    // Blur/pause/reset cancels unstaged action pulses. Ordered press/release edges remain available.
    this.digitalPresses.clear();
    if (this.pointer) { this.pointer = { ...this.pointer, down: false }; }
  }
  sample(): Readonly<Record<string, unknown>> {
    const actions = Object.fromEntries(this.held);
    // A boolean tap survives until one sampled tick, even if its release arrived between ticks.
    // Numeric actions always retain the sampled analog value and never acquire a digital pulse.
    for (const action of this.digitalPresses) { actions[action] = true; }
    const horizontal = Math.max(-1, Math.min(1, Number(actions.right ?? 0) - Number(actions.left ?? 0)));
    const vertical = Math.max(-1, Math.min(1, Number(actions.forward ?? 0) - Number(actions.backward ?? 0)));
    const value: Record<string, unknown> = { actions, move: this.dimension === "2d" ? { x: horizontal, y: vertical } : [horizontal, 0, vertical ? -vertical : 0],
      jump: Boolean(actions.jump), edges: this.edges };
    if (this.pointer) { value.pointer = this.pointer; }
    if (this.lookX || this.lookY) { value.look = { x: this.lookX, y: this.lookY }; }
    const input = nativeRuntimeInput.parse(value);
    this.edges.length = 0; this.digitalPresses.clear(); this.lookX = 0; this.lookY = 0; return input;
  }
}

export interface NativeInputBinding { readonly action: string; readonly binding: string }
export const NATIVE_DEFAULT_INPUT_BINDINGS: readonly NativeInputBinding[] = [
  { action: "left", binding: "key:KeyA" }, { action: "left", binding: "key:ArrowLeft" },
  { action: "right", binding: "key:KeyD" }, { action: "right", binding: "key:ArrowRight" },
  { action: "forward", binding: "key:KeyW" }, { action: "forward", binding: "key:ArrowUp" },
  { action: "backward", binding: "key:KeyS" }, { action: "backward", binding: "key:ArrowDown" },
  { action: "jump", binding: "key:Space" }
];
/** Bindings are explicit keyboard codes, pointer buttons, touch, or gamepad button/axis indices. */
export function attachNativeBrowserInput(input: NativeBrowserInput, target: HTMLElement, bindings: readonly NativeInputBinding[]): { pollGamepads(): void; releaseAll(): void; dispose(): void } {
  const controller = new AbortController(), signal = controller.signal;
  const allBindings = [...NATIVE_DEFAULT_INPUT_BINDINGS, ...bindings];
  const bindingActions = new Map<string, Set<string>>(), actionBindings = new Map<string, Set<string>>();
  const values = new Map<string, number | boolean>();
  let drag: { pointerId: number; x: number; y: number } | undefined;
  for (const entry of allBindings) {
    const actions = bindingActions.get(entry.binding) ?? new Set<string>(); actions.add(entry.action); bindingActions.set(entry.binding, actions);
    const sources = actionBindings.get(entry.action) ?? new Set<string>(); sources.add(entry.binding); actionBindings.set(entry.action, sources);
  }
  const apply = (binding: string, value: number | boolean): void => {
    values.set(binding, value);
    for (const action of bindingActions.get(binding) ?? []) {
      let amount: number | boolean = false;
      for (const source of actionBindings.get(action) ?? []) {
        const candidate = values.get(source) ?? false;
        if (Math.abs(Number(candidate)) > Math.abs(Number(amount))) { amount = candidate; }
      }
      input.set(action, amount);
    }
  };
  const release = (): void => { drag = undefined; values.clear(); input.releaseAll(); };
  target.addEventListener("keydown", (event) => { if (!event.repeat) { apply(`key:${event.code}`, true); } }, { signal });
  window.addEventListener("keyup", (event) => apply(`key:${event.code}`, false), { signal });
  target.addEventListener("pointerdown", (event) => {
    if (event.button === 0 || event.button === 2) { drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }; }
    apply(`pointer:${event.button}`, true); input.setPointer(event.offsetX, event.offsetY, true);
    if (target.hasPointerCapture && !target.hasPointerCapture(event.pointerId)) { target.setPointerCapture(event.pointerId); }
  }, { signal });
  target.addEventListener("pointermove", (event) => {
    input.setPointer(event.offsetX, event.offsetY, event.buttons !== 0);
    if (target.ownerDocument.pointerLockElement === target) { input.addLook(event.movementX, event.movementY); }
    else if (drag?.pointerId === event.pointerId && (event.buttons & 3)) {
      input.addLook(event.clientX - drag.x, event.clientY - drag.y);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }, { signal });
  window.addEventListener("pointerup", (event) => {
    if (drag?.pointerId === event.pointerId && !(event.buttons & 3)) { drag = undefined; }
    apply(`pointer:${event.button}`, false);
    const bounds = target.getBoundingClientRect(); input.setPointer(event.clientX - bounds.left, event.clientY - bounds.top, false);
  }, { signal });
  target.addEventListener("pointercancel", release, { signal });
  target.addEventListener("touchstart", () => apply("touch", true), { signal });
  target.addEventListener("touchend", (event) => { if (!event.touches.length) { apply("touch", false); } }, { signal });
  target.addEventListener("touchcancel", release, { signal });
  window.addEventListener("blur", release, { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { release(); } }, { signal });
  return {
    releaseAll: release,
    pollGamepads() {
      const pads = navigator.getGamepads?.() ?? [];
      for (const binding of bindingActions.keys()) {
        const match = /^gamepad:(\d+):(button|axis):(\d+)$/u.exec(binding);
        if (!match) { continue; }
        const pad = pads[Number(match[1])], index = Number(match[3]);
        if (match[2] === "button") { apply(binding, (pad?.buttons[index]?.value ?? 0) > 0.5); }
        else { const value = pad?.axes[index] ?? 0; apply(binding, Math.abs(value) < 0.15 ? 0 : value); }
      }
    },
    dispose() { controller.abort(); release(); }
  };
}

/** A paused clock drops elapsed wall time. Overruns drop wall-time debt after bounded catch-up. */
export class NativeFixedTickClock {
  private previous: number | undefined;
  private accumulated = 0;
  private paused = false;
  constructor(readonly ticksPerSecond = 60, readonly maxCatchUpTicks = 4) {
    if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0 || ticksPerSecond > 1000 || !Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1 || maxCatchUpTicks > 120) { throw new Error("Invalid native fixed tick clock limits"); }
  }
  pause(paused = true): void { this.paused = paused; this.previous = undefined; this.accumulated = 0; }
  advance(nowMs: number): number {
    if (!Number.isFinite(nowMs)) { throw new Error("Invalid native clock timestamp"); }
    if (this.paused) { return 0; }
    if (this.previous === undefined) { this.previous = nowMs; return 0; }
    const elapsed = Math.max(0, nowMs - this.previous); this.previous = nowMs;
    const duration = 1000 / this.ticksPerSecond;
    this.accumulated += elapsed;
    const due = Math.floor((this.accumulated + 1e-9) / duration);
    const ticks = Math.min(due, this.maxCatchUpTicks);
    this.accumulated = Math.max(0, this.accumulated - (due > this.maxCatchUpTicks ? due : ticks) * duration);
    return ticks;
  }
}

/** Exact test/replay stepping never uses the wall clock or drops a requested tick. */
export async function stepNativeExactly(ticks: number, step: (index: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 100_000) { throw new Error("Invalid exact native tick count"); }
  for (let index = 0; index < ticks; index += 1) { signal?.throwIfAborted(); await step(index); }
}
