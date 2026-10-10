import { gameEventReaches, type GameEventTarget } from "@nodetool-ai/protocol";

/**
 * Lifecycle-object scripts: a script source may evaluate to an object of hooks instead of a function.
 * The guest dispatcher below runs the hooks inside the behavior's single call per tick, so the call,
 * batch, input and output budgets apply unchanged. Its runtime state, including timers, is a JSON record
 * stored in the snapshot's `scriptState`, which makes hooks and timers replay from any snapshot.
 */

/** Hook names in the order the dispatcher runs them within one tick. */
export const GAME_SCRIPT_HOOKS = [
  "onStart", "onSceneEnter", "onTriggerEnter", "onTriggerExit", "onContact", "onEvent", "onFixedUpdate", "onUpdate", "onDestroy"
] as const;

export type GameScriptHook = (typeof GAME_SCRIPT_HOOKS)[number];

export const MAX_GAME_SCRIPT_TIMERS = 32;
/** About 4.6 hours at 60 ticks per second. */
export const MAX_GAME_SCRIPT_TIMER_TICKS = 1_000_000;

/** A contact from the previous tick's events, seen from the calling entity. */
export interface GameScriptContact {
  readonly otherId: string;
  readonly phase: "enter" | "stay" | "exit";
  /** True when either collider is a sensor. Sensor contacts drive the trigger hooks. */
  readonly sensor: boolean;
}

/** Host facts for one lifecycle-object call. Plain-function calls never carry this field. */
export interface GameScriptLifecycle {
  readonly sceneEnter?: true;
  readonly contacts?: readonly GameScriptContact[];
  /** Indices into the call input's `events` of the previous tick's trigger events that reach the entity, in event order. */
  readonly events?: readonly number[];
  /** The entity despawned in the previous tick. Only `onDestroy` runs. */
  readonly destroy?: true;
}

export interface GameScriptTimer {
  readonly name: string;
  readonly at: number;
  readonly every?: number;
}

/** The `scriptState` value of a lifecycle-object behavior. `state` is what the hooks see as `input.state`. */
export interface GameScriptLifecycleRecord {
  readonly $lifecycle: 1;
  readonly state: unknown;
  readonly timers: readonly GameScriptTimer[];
  readonly destroyed?: true;
  /** The last call of a spawned instance that left the world, kept until its `onDestroy` call runs. */
  readonly removed?: Readonly<Record<string, unknown>>;
}

export function isScriptLifecycleRecord(value: unknown): value is GameScriptLifecycleRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as { $lifecycle?: unknown }).$lifecycle === 1;
}

/** A lifecycle record that still owes an `onDestroy` call. */
export function awaitsDestroy(value: unknown): value is GameScriptLifecycleRecord {
  return isScriptLifecycleRecord(value) && value.destroyed !== true;
}

export interface GameScriptLimits {
  readonly maxCommands: number;
  readonly maxTickMs: number;
}

function parseKey(key: unknown): readonly [string, string, number] | undefined {
  if (typeof key !== "string") { return undefined; }
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && parsed.length === 3 && typeof parsed[0] === "string" && typeof parsed[1] === "string"
      && Number.isInteger(parsed[2]) ? parsed as [string, string, number] : undefined;
  } catch {
    // Not a script key, so not a record the despawn path wrote.
    return undefined;
  }
}

/**
 * The `onDestroy` call for a removed instance's record, or undefined when the record is not one the despawn path
 * could have written. `scriptState` is guest-written and snapshot-restored, so the record supplies only the entity's
 * last observable fields. The key, the source, and every limit come from the host: the record's key must name an
 * entity of the current scene that no longer exists, its source must be a lifecycle source for the same behavior
 * index, and `limitsOf` reads `maxCommands` and `maxTickMs` from the document's behavior definition.
 */
export function removedDestroyCall(
  stateKey: string,
  record: unknown,
  context: {
    readonly sceneId: string;
    readonly hookSources: ReadonlySet<string>;
    readonly limitsOf: (sourceKey: string) => GameScriptLimits | undefined;
    readonly exists: (entityId: string) => boolean;
    /** The call fields a destroy hook may read from the record, such as position and velocity. */
    readonly fields: readonly string[];
  }
): Record<string, unknown> | undefined {
  if (!awaitsDestroy(record)) { return undefined; }
  const { removed, ...rest } = record;
  if (typeof removed !== "object" || removed === null || Array.isArray(removed)) { return undefined; }
  const key = parseKey(stateKey);
  const sourceKey = (removed as { readonly sourceKey?: unknown }).sourceKey;
  const source = parseKey(sourceKey);
  if (!key || !source || typeof sourceKey !== "string" || key[0] !== context.sceneId || context.exists(key[1])
    || source[2] !== key[2] || !context.hookSources.has(sourceKey)) {
    return undefined;
  }
  const limits = context.limitsOf(sourceKey);
  if (!limits) { return undefined; }
  const fields: Record<string, unknown> = {};
  for (const field of context.fields) {
    if (Object.hasOwn(removed, field)) { fields[field] = (removed as Record<string, unknown>)[field]; }
  }
  return { ...fields, active: false, sourceKey, stateKey, entityId: key[1], source: source[1],
    maxCommands: limits.maxCommands, maxTickMs: limits.maxTickMs, state: rest, lifecycle: { destroy: true } };
}

/** Commands an `onDestroy` call may return. The entity is gone, so commands that act on it are rejected. */
const DESTROY_COMMANDS = new Set(["hud", "emit", "spawn", "despawn", "sceneTransition"]);

export function assertDestroyCommands(commands: readonly { readonly kind: string }[], entityId: string, tick: number): void {
  for (const command of commands) {
    if (!DESTROY_COMMANDS.has(command.kind)) {
      throw new Error(`Game script onDestroy for ${entityId} at tick ${tick} cannot use ${command.kind}`);
    }
  }
}

/** Checks the own keys of a lifecycle object. `functions` lists the keys whose values are functions. */
export function scriptHookIssue(keys: readonly string[], functions: readonly string[]): string | undefined {
  const known = new Set<string>(GAME_SCRIPT_HOOKS);
  const callable = new Set(functions);
  for (const key of keys) {
    if (/^on[A-Z]/.test(key) && !known.has(key)) {
      return `unknown lifecycle hook ${key}; use ${GAME_SCRIPT_HOOKS.join(", ")}`;
    }
    if (known.has(key) && !callable.has(key)) {
      return `lifecycle hook ${key} must be a function`;
    }
  }
  if (callable.has("onUpdate") && callable.has("onFixedUpdate")) {
    return "onFixedUpdate is an alias of onUpdate; define one of them";
  }
  if (!GAME_SCRIPT_HOOKS.some((hook) => callable.has(hook))) {
    return "a lifecycle object must define at least one hook";
  }
  return undefined;
}

/** Contacts involving `entityId` in the previous tick's events, in event order. */
export function scriptContacts(
  entityId: string,
  events: readonly unknown[],
  sensorOf: (event: { readonly entityId: string; readonly otherId: string; readonly sensor?: boolean }) => boolean
): GameScriptContact[] {
  const contacts: GameScriptContact[] = [];
  for (const value of events) {
    const event = value as { readonly kind: string; readonly entityId: string; readonly otherId: string; readonly phase?: GameScriptContact["phase"]; readonly sensor?: boolean };
    if (event.kind !== "contact" || (event.entityId !== entityId && event.otherId !== entityId)) {
      continue;
    }
    contacts.push({ otherId: event.entityId === entityId ? event.otherId : event.entityId, phase: event.phase ?? "enter", sensor: sensorOf(event) });
  }
  return contacts;
}

/**
 * Indices of the previous tick's trigger events that reach an entity, in event order. Only calls of scripts that
 * define `onEvent` carry them, so the input of every other call stays as it was.
 */
export function scriptEvents(entityId: string, tags: readonly string[] | undefined, events: readonly unknown[]): number[] {
  const indices: number[] = [];
  events.forEach((value, index) => {
    const event = value as { readonly kind: string; readonly target?: GameEventTarget };
    if (event.kind === "trigger" && gameEventReaches(event, entityId, tags)) { indices.push(index); }
  });
  return indices;
}

/** The lifecycle facts for a call, or undefined when there are none. */
export function scriptLifecycle(sceneEnter: boolean, contacts: readonly GameScriptContact[], events: readonly number[] = []): GameScriptLifecycle | undefined {
  if (!sceneEnter && contacts.length === 0 && events.length === 0) {
    return undefined;
  }
  return { ...(sceneEnter ? { sceneEnter: true as const } : undefined), ...(contacts.length > 0 ? { contacts } : undefined),
    ...(events.length > 0 ? { events } : undefined) };
}

/**
 * One hook invocation of a call, in order. The second element is a contact hook's contact, or for `onEvent` the
 * index of its event in the call input's `events`. The dispatcher resolves the index, so a payload is not sent twice.
 */
export type GameScriptHookStep = readonly [name: string, argument?: GameScriptContact | number];

export interface GameScriptHookPlan {
  /** The state the first hook sees. */
  readonly state: unknown;
  readonly steps: readonly GameScriptHookStep[];
  /** Timers after this tick's due timers were consumed, before the hooks schedule new ones. */
  readonly timers: readonly GameScriptTimer[];
  readonly destroy: boolean;
}

/**
 * Orders the hooks of one call. Timers due at the start of the tick fire in schedule order after the contact
 * and event hooks. A timer scheduled during the tick fires on a later tick.
 */
export function planScriptHooks(record: unknown, lifecycle: GameScriptLifecycle | undefined, tick: number): GameScriptHookPlan {
  const first = record === null || record === undefined;
  if (!first && !isScriptLifecycleRecord(record)) {
    throw new Error("lifecycle script state is not a lifecycle record");
  }
  if (!first && (!Array.isArray(record.timers) || record.timers.length > MAX_GAME_SCRIPT_TIMERS || !record.timers.every((timer) =>
    typeof timer === "object" && timer !== null && validTimerName(timer.name) && Number.isInteger(timer.at)
      && (timer.every === undefined || validTimerTicks(timer.every))))) {
    throw new Error("lifecycle script state has invalid timers");
  }
  const state = first ? null : record.state;
  if (lifecycle?.destroy) {
    return { state, steps: [["onDestroy"]], timers: [], destroy: true };
  }
  const steps: GameScriptHookStep[] = [];
  if (first) { steps.push(["onStart"]); }
  if (lifecycle?.sceneEnter) { steps.push(["onSceneEnter"]); }
  for (const contact of lifecycle?.contacts ?? []) {
    if (!contact.sensor) { steps.push(["onContact", contact]); }
    else if (contact.phase === "enter") { steps.push(["onTriggerEnter", contact]); }
    else if (contact.phase === "exit") { steps.push(["onTriggerExit", contact]); }
  }
  for (const index of lifecycle?.events ?? []) { steps.push(["onEvent", index]); }
  const timers: GameScriptTimer[] = [];
  for (const timer of first ? [] : record.timers) {
    if (timer.at > tick) { timers.push(timer); continue; }
    steps.push([timer.name]);
    if (timer.every !== undefined) { timers.push({ name: timer.name, at: tick + timer.every, every: timer.every }); }
  }
  steps.push(["onFixedUpdate"], ["onUpdate"]);
  return { state, steps, timers, destroy: false };
}

function validTimerTicks(ticks: unknown): ticks is number {
  return Number.isInteger(ticks) && (ticks as number) >= 1 && (ticks as number) <= MAX_GAME_SCRIPT_TIMER_TICKS;
}

function validTimerName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= 128 && !(GAME_SCRIPT_HOOKS as readonly string[]).includes(name)
    && !["__proto__", "constructor", "prototype"].includes(name);
}

/** Builds the next record from the dispatcher's `[state, scheduled]` result. Scheduling a name replaces its timer. */
export function commitScriptHooks(value: unknown, plan: GameScriptHookPlan, tick: number): GameScriptLifecycleRecord {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[1])) {
    throw new Error("lifecycle dispatcher returned an invalid result");
  }
  const [state, scheduled] = value as [unknown, unknown[]];
  if (plan.destroy) {
    return { $lifecycle: 1, state, timers: [], destroyed: true };
  }
  const timers = [...plan.timers];
  for (const entry of scheduled) {
    // The dispatcher runs in the guest, which can replace the built-ins it uses, so every timer is checked again here.
    if (!Array.isArray(entry) || entry.length !== 3 || !validTimerName(entry[0]) || !validTimerTicks(entry[1]) || typeof entry[2] !== "boolean") {
      throw new Error("lifecycle dispatcher returned an invalid timer");
    }
    const [name, ticks, repeat] = entry as [string, number, boolean];
    const timer: GameScriptTimer = repeat ? { name, at: tick + ticks, every: ticks } : { name, at: tick + ticks };
    const index = timers.findIndex((candidate) => candidate.name === name);
    if (index >= 0) { timers[index] = timer; } else { timers.push(timer); }
  }
  if (timers.length > MAX_GAME_SCRIPT_TIMERS) {
    throw new Error(`a script may hold at most ${MAX_GAME_SCRIPT_TIMERS} timers`);
  }
  return { $lifecycle: 1, state, timers };
}

/**
 * Guest code for the dispatcher, compiled into each lifecycle-object context, so it stays small. It runs the
 * planned hooks and returns `{state: [state, scheduled], commands}`, which `commitScriptHooks` turns into a record.
 */
export const SCRIPT_LIFECYCLE_DISPATCH = `((hasOwn, isArray, isInteger, defineProperty, hookNames) => (hooks, payload, steps) => {
  let state = payload.state;
  const commands = [], scheduled = [], events = payload.events;
  const schedule = (repeat) => (ticks, name) => {
    if (!isInteger(ticks) || ticks < 1 || ticks > ${MAX_GAME_SCRIPT_TIMER_TICKS}) { throw new Error("timer ticks must be an integer from 1 to ${MAX_GAME_SCRIPT_TIMER_TICKS}"); }
    if (typeof name !== "string" || hookNames.includes(name) || typeof hooks[name] !== "function") { throw new Error("timer " + String(name) + " must name a method of the script object that is not a hook"); }
    scheduled.push([name, ticks, repeat]);
  };
  defineProperty(globalThis, "after", { value: schedule(false), writable: true, configurable: true });
  defineProperty(globalThis, "every", { value: schedule(true), writable: true, configurable: true });
  for (const [name, argument] of steps) {
    const hook = hooks[name];
    if (typeof hook !== "function") { continue; }
    payload.state = state;
    const result = argument === undefined ? hook.call(hooks, payload) : hook.call(hooks, payload, name === "onEvent" ? events[argument] : argument);
    if (result === undefined) { continue; }
    if (result === null || typeof result !== "object" || isArray(result)) { throw new Error(name + " must return an object or undefined"); }
    if (hasOwn(result, "state")) { state = result.state; }
    if (result.commands !== undefined) {
      if (!isArray(result.commands)) { throw new Error(name + " commands must be an array"); }
      for (const command of result.commands) { commands.push(command); }
    }
  }
  return { state: [state, scheduled], commands };
})(Object.hasOwn, Array.isArray, Number.isInteger, Object.defineProperty, ${JSON.stringify(GAME_SCRIPT_HOOKS)})`;
