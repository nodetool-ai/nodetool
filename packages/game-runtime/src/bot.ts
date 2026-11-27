import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from "quickjs-emscripten-core";
import { z } from "zod";
import type { GameDocument, GameEvent, GameInputFrame, GameRenderFrame } from "@nodetool-ai/protocol";

import { createScriptedGameSession, type GameSession, type GameSessionOptions, type GameStepResult } from "./session.js";

/** Built-in bots that need no policy file. They probe edge cases, not skill. */
export const GAME_EDGE_BOTS = ["idle", "hold", "mash", "random"] as const;
export type GameEdgeBot = typeof GAME_EDGE_BOTS[number];
/** UTF-16 code units allowed in a bot policy file. */
export const GAME_BOT_SOURCE_LIMIT = 65_536;
/** Longest decision a bot can make. A bot is called again only when its decision ends. */
export const GAME_BOT_DECISION_MAX_TICKS = 3600;
/** Wall time allowed for one `decide` call. Bots run only in test runs, never in play. */
export const GAME_BOT_CALL_MS = 100;
const BOT_PREPARE_MS = 1000;

/**
 * Who plays a test run. `skill` runs a game's own policy file with a skill from 0 (weakest) to 1 (best).
 * `inputs` replays a recording, so a seed sweep can reuse a route.
 */
export type GameBotSpec =
  | { readonly kind: "edge"; readonly name: GameEdgeBot }
  | { readonly kind: "skill"; readonly skill: number; readonly source: string }
  | { readonly kind: "inputs"; readonly frames: readonly GameInputFrame[] };

/** What a policy bot sees: the drawn frame and the numbers a player can read. Never entity props or script state. */
export interface GameBotView {
  readonly tick: number;
  readonly sceneId: string;
  readonly score: number;
  readonly won: boolean;
  readonly width: number;
  readonly height: number;
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly sprites: readonly {
    readonly entityId: string; readonly assetId: string; readonly x: number; readonly y: number;
    readonly width: number; readonly height: number; readonly layer: number;
    /** The source rectangle of the sprite sheet cell drawn, which tells animation states apart. */
    readonly frame?: GameRenderFrame["sprites"][number]["frame"]; readonly opacity?: number;
  }[];
  readonly hud: readonly { readonly id: string; readonly text: string; readonly x: number; readonly y: number }[];
  readonly ui?: GameRenderFrame["ui"];
}

/** One bot decision: actions held and tapped for `ticks` ticks. A tap is pressed only on the decision's first tick. */
export const gameBotDecision = z.strictObject({
  hold: z.array(z.string()).default([]),
  tap: z.array(z.string()).default([]),
  ticks: z.number().int().min(1).max(GAME_BOT_DECISION_MAX_TICKS),
  /** Kept for the next decision as `bot.state`. */
  state: z.json().optional()
});

export type GameBotDecision = z.output<typeof gameBotDecision>;

/** Parses a `--bot` value: an edge bot name or a skill from 0 to 1, which needs a policy source. */
export function parseGameBotSpec(value: string, source?: string): Exclude<GameBotSpec, { kind: "inputs" }> {
  const name = value.trim();
  if ((GAME_EDGE_BOTS as readonly string[]).includes(name)) {
    if (source !== undefined) { throw new Error(`Bot ${name} is built in and takes no bot file`); }
    return { kind: "edge", name: name as GameEdgeBot };
  }
  const skill = name === "" ? Number.NaN : Number(name);
  if (!Number.isFinite(skill) || skill < 0 || skill > 1) {
    throw new Error(`Bot must be ${GAME_EDGE_BOTS.join(", ")} or a skill from 0 to 1, got ${JSON.stringify(value)}`);
  }
  if (source === undefined) { throw new Error("A skill bot needs a bot file with the game's policy"); }
  if (source.length > GAME_BOT_SOURCE_LIMIT) { throw new Error(`Bot file exceeds ${GAME_BOT_SOURCE_LIMIT} characters`); }
  return { kind: "skill", skill, source };
}

/** Deterministic 32-bit generator for bot choices. It never touches the game's own random state. */
function botRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Separates the bot's random stream from the game's stream for the same seed. */
function botSeed(seed: number): number {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  return (value ^ (value >>> 13)) >>> 0;
}

interface BotDriver {
  /** Builds the view only for bots that read it. */
  decide(view: () => GameBotView, tick: number): GameBotDecision;
  dispose(): void;
}

function edgeDriver(name: GameEdgeBot, actions: readonly string[], seed: number): BotDriver {
  const random = botRandom(botSeed(seed));
  return {
    decide() {
      switch (name) {
        case "idle": return { hold: [], tap: [], ticks: GAME_BOT_DECISION_MAX_TICKS };
        // A finger that never lifts: every action pressed once, then held for the whole run.
        case "hold": return { hold: [...actions], tap: [], ticks: GAME_BOT_DECISION_MAX_TICKS };
        // Always act: every action pressed on every other tick, so each press is a new press.
        case "mash": return { hold: [], tap: [...actions], ticks: 2 };
        case "random": {
          const ticks = 6 + Math.floor(random() * 25);
          if (actions.length === 0) { return { hold: [], tap: [], ticks }; }
          const chosen = actions[Math.floor(random() * actions.length)];
          return random() < 0.5 ? { hold: [chosen], tap: [], ticks } : { hold: [], tap: [chosen], ticks };
        }
      }
    },
    dispose() {}
  };
}

function inputsDriver(frames: readonly GameInputFrame[]): BotDriver {
  return {
    decide(_view, tick) {
      const frame = frames[tick];
      return frame ? { hold: [...frame.pressed], tap: [...frame.justPressed], ticks: 1 } : { hold: [], tap: [], ticks: GAME_BOT_DECISION_MAX_TICKS };
    },
    dispose() {}
  };
}

/**
 * Runs before the policy source, so the policy sees no clock and a seeded `Math.random`. `bot.roll` is one fresh
 * number per decision. `bot.rollFor(key)` returns the same number for the same key for the whole run, so a bot that
 * revisits one game decision does not roll again.
 */
const BOT_BOOTSTRAP = `(seed) => {
  globalThis.Date = undefined;
  let state = seed >>> 0;
  const next = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  Object.defineProperty(Math, "random", { value: next, writable: false, configurable: false });
  const rollFor = (key) => {
    const text = String(key);
    let hash = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < text.length; index += 1) { hash = Math.imul(hash ^ text.charCodeAt(index), 16777619); }
    hash ^= hash >>> 16; hash = Math.imul(hash, 2246822507); hash ^= hash >>> 13; hash = Math.imul(hash, 3266489909); hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
  return (policy) => {
    const decide = typeof policy === "function" ? policy
      : policy !== null && typeof policy === "object" && typeof policy.decide === "function" ? policy.decide.bind(policy) : undefined;
    if (decide === undefined) { throw new Error("A bot file must evaluate to a function or an object with decide(view, bot)"); }
    return (viewJson, metaJson) => {
      const meta = JSON.parse(metaJson);
      const bot = Object.freeze({ skill: meta.skill, actions: meta.actions, state: meta.state, decisions: meta.decisions,
        roll: next(), random: next, rollFor });
      const result = decide(JSON.parse(viewJson), bot);
      return JSON.stringify(result === undefined ? null : result);
    };
  };
}`;

function guestResult(context: QuickJSContext, result: ReturnType<QuickJSContext["evalCode"]>, what: string): QuickJSHandle {
  if (result.error) {
    let error: unknown;
    try { error = context.dump(result.error); } finally { result.error.dispose(); }
    const message = error !== null && typeof error === "object" && "message" in error && error.message != null ? String(error.message) : String(error);
    throw new Error(`${what} failed: ${message}`);
  }
  return result.value;
}

async function policyDriver(source: string, skill: number, actions: readonly string[], seed: number): Promise<BotDriver> {
  const [{ newQuickJSWASMModuleFromVariant }, variantModule] = await Promise.all([
    import("quickjs-emscripten-core"),
    import("@jitl/quickjs-ng-wasmfile-release-sync")
  ]);
  const variant = (variantModule as unknown as { default: Parameters<typeof newQuickJSWASMModuleFromVariant>[0] }).default;
  const module = await newQuickJSWASMModuleFromVariant(variant);
  const runtime: QuickJSRuntime = module.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  let deadline = performance.now() + BOT_PREPARE_MS;
  let budget = "bot preparation";
  runtime.setInterruptHandler(() => performance.now() > deadline);
  const context = runtime.newContext();
  let call: QuickJSHandle | undefined;
  try {
    const bootstrap = guestResult(context, context.evalCode(BOT_BOOTSTRAP, "bot-bootstrap.js"), "Bot bootstrap");
    try {
      const seedHandle = context.newNumber(botSeed(seed));
      const make = guestResult(context, context.callFunction(bootstrap, context.undefined, seedHandle), "Bot bootstrap");
      seedHandle.dispose();
      try {
        const policy = guestResult(context, context.evalCode(source, "bot.js"), "Bot file");
        try { call = guestResult(context, context.callFunction(make, context.undefined, policy), "Bot file"); }
        finally { policy.dispose(); }
      } finally { make.dispose(); }
    } finally { bootstrap.dispose(); }
  } catch (error) {
    context.dispose();
    runtime.dispose();
    throw interruptedAs(error, budget, BOT_PREPARE_MS);
  }
  let state: unknown;
  let decisions = 0;
  const invoke = call;
  return {
    decide(view) {
      const viewHandle = context.newString(JSON.stringify(view()));
      const metaHandle = context.newString(JSON.stringify({ skill, actions, state: state ?? null, decisions }));
      budget = "bot decide";
      deadline = performance.now() + GAME_BOT_CALL_MS;
      let text: unknown;
      try {
        const result = guestResult(context, context.callFunction(invoke, context.undefined, viewHandle, metaHandle), "Bot decide");
        try { text = context.dump(result); } finally { result.dispose(); }
      } catch (error) {
        throw interruptedAs(error, budget, GAME_BOT_CALL_MS);
      } finally {
        viewHandle.dispose();
        metaHandle.dispose();
      }
      const parsed = gameBotDecision.safeParse(typeof text === "string" ? JSON.parse(text) : text);
      if (!parsed.success) { throw new Error(`Bot decide returned an invalid decision: ${z.prettifyError(parsed.error)}`); }
      decisions += 1;
      state = parsed.data.state;
      return parsed.data;
    },
    dispose() {
      invoke.dispose();
      context.dispose();
      runtime.dispose();
    }
  };
}

function interruptedAs(error: unknown, budget: string, ms: number): unknown {
  if (error instanceof Error && /interrupted/i.test(error.message)) {
    return new Error(`${budget} exceeded ${ms} ms`);
  }
  return error;
}

async function createDriver(spec: GameBotSpec, actions: readonly string[], seed: number): Promise<BotDriver> {
  switch (spec.kind) {
    case "edge": return edgeDriver(spec.name, actions, seed);
    case "inputs": return inputsDriver(spec.frames);
    case "skill": return policyDriver(spec.source, spec.skill, actions, seed);
  }
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

function viewOf(session: GameSession, frame: GameRenderFrame): GameBotView {
  const state = session.inspect({ entityId: "\u0000" });
  const sprites = frame.sprites.map((sprite) => {
    const view: Mutable<GameBotView["sprites"][number]> = { entityId: sprite.entityId, assetId: sprite.assetId, x: sprite.x, y: sprite.y,
      width: sprite.width, height: sprite.height, layer: sprite.layer };
    if (sprite.frame !== undefined) { view.frame = sprite.frame; }
    if (sprite.opacity !== undefined) { view.opacity = sprite.opacity; }
    return view;
  });
  const view: Mutable<GameBotView> = {
    tick: state.tick, sceneId: state.sceneId, score: state.score, won: state.won,
    width: frame.width, height: frame.height, camera: { x: frame.camera.x, y: frame.camera.y, zoom: frame.camera.zoom },
    sprites, hud: frame.hud.map((label) => ({ id: label.id, text: label.text, x: label.x, y: label.y }))
  };
  if (frame.ui !== undefined) { view.ui = frame.ui; }
  return view;
}

export interface GameBotRunOptions {
  readonly bot: GameBotSpec;
  readonly seed: number;
  /** The run stops here when the game has not ended. */
  readonly ticks: number;
  /** Trigger events that end the session as well as a win, such as `lose` or `level_complete`. */
  readonly endEvents?: readonly string[];
  readonly sessionOptions?: GameSessionOptions;
  /** Adjusts each input frame before the step, for example to deliver recorded save loads. */
  readonly prepareInput?: (input: GameInputFrame) => GameInputFrame;
  /** Runs after each step and before the next one, for example to perform save requests. */
  readonly afterStep?: (result: GameStepResult, session: GameSession) => Promise<void> | void;
}

export interface GameBotRunResult {
  readonly seed: number;
  /** Ticks stepped. */
  readonly ticks: number;
  readonly ended: boolean;
  /** The tick at which the session ended, or null when it ran out of ticks or failed. */
  readonly endTick: number | null;
  readonly endReason: "win" | "event" | null;
  readonly endEvent?: string;
  readonly won: boolean;
  readonly score: number;
  readonly decisions: number;
  /** A script or bot failure stops the run. The tick is the one that failed. */
  readonly error?: { readonly tick: number; readonly message: string };
}

function endOf(events: readonly GameEvent[], endEvents: ReadonlySet<string>): { reason: "win" | "event"; event?: string } | undefined {
  for (const event of events) {
    if (event.kind === "win") { return { reason: "win" }; }
    if (event.kind === "trigger" && endEvents.has(event.event)) { return { reason: "event", event: event.event }; }
  }
  return undefined;
}

/**
 * Plays one 2D session with a bot until the game ends or `ticks` run out. The bot draws from its own random
 * stream, so the game's random numbers match a run with recorded inputs from the same seed.
 */
export async function runGameBot(document: GameDocument, options: GameBotRunOptions): Promise<GameBotRunResult> {
  const actions = document.inputActions;
  const known = new Set(actions);
  const endEvents = new Set(options.endEvents ?? []);
  const driver = await createDriver(options.bot, actions, options.seed);
  let session: GameSession | undefined;
  let tick = 0;
  let decisions = 0;
  let remaining = 0;
  let decision: GameBotDecision = { hold: [], tap: [], ticks: 1 };
  let previousHold = new Set<string>();
  let lastKnown = { won: false, score: 0 };
  const finish = (fields: Partial<GameBotRunResult>): GameBotRunResult => {
    let state = { won: false, score: 0 };
    // A session that failed a step refuses inspection, so a failed run reports the last state it reached.
    try { state = session?.inspect({ entityId: "\u0000" }) ?? state; } catch { state = lastKnown; }
    return { seed: options.seed, ticks: tick, ended: false, endTick: null, endReason: null,
      won: state.won, score: state.score, decisions, ...fields };
  };
  try {
    try {
      session = await createScriptedGameSession(document, options.seed, undefined, undefined, options.sessionOptions);
    } catch (error) {
      return finish({ error: { tick: 0, message: error instanceof Error ? error.message : String(error) } });
    }
    let frame = session.frame();
    const current = session;
    while (tick < options.ticks) {
      let input: GameInputFrame;
      try {
        if (remaining === 0) {
          decision = driver.decide(() => viewOf(current, frame), tick);
          for (const action of [...decision.hold, ...decision.tap]) {
            if (!known.has(action)) { throw new Error(`Bot used unknown action ${JSON.stringify(action)}. The game declares ${actions.join(", ") || "no actions"}`); }
          }
          remaining = decision.ticks;
          decisions += 1;
          const first = new Set([...decision.tap, ...decision.hold.filter((action) => !previousHold.has(action))]);
          input = { pressed: [...new Set([...decision.hold, ...decision.tap])], justPressed: [...first] };
          previousHold = new Set(decision.hold);
        } else {
          input = { pressed: [...decision.hold], justPressed: [] };
        }
      } catch (error) {
        return finish({ error: { tick: tick + 1, message: error instanceof Error ? error.message : String(error) } });
      }
      remaining -= 1;
      let result: GameStepResult;
      try {
        result = current.step(options.prepareInput ? options.prepareInput(input) : input);
        await options.afterStep?.(result, current);
      } catch (error) {
        return finish({ error: { tick: tick + 1, message: error instanceof Error ? error.message : String(error) } });
      }
      tick = result.tick;
      frame = result.frame;
      if (remaining === 0) { const state = current.inspect({ entityId: "\u0000" }); lastKnown = { won: state.won, score: state.score }; }
      const end = endOf(result.events, endEvents);
      if (end) {
        const ending: Mutable<Partial<GameBotRunResult>> = { ended: true, endTick: result.tick, endReason: end.reason };
        if (end.event !== undefined) { ending.endEvent = end.event; }
        return finish(ending);
      }
    }
    return finish({});
  } finally {
    session?.dispose();
    driver.dispose();
  }
}
