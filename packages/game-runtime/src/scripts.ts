import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from "quickjs-emscripten-core";
import { z } from "zod";
import { gameNonSpatialScriptCommand, type GameDocument, type GameSnapshot } from "@nodetool-ai/protocol";

import { canPersistGameScript } from "./script-persistence.js";
import { gameScriptValue, scriptHandleResult } from "./script-transport.js";
import { ScriptWorldSnapshot, type ScriptWorldEntity } from "./script-world.js";

const encoder = new TextEncoder();
const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const gameScriptCommand = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("setVelocity"), x: finite, y: finite }),
  z.strictObject({ kind: z.literal("setPosition"), x: finite, y: finite }),
  z.strictObject({ kind: z.literal("setVisual"), tint: color.optional(), opacity: finite.min(0).max(1).optional(),
    rotation: finite.optional(), scaleX: finite.positive().optional(), scaleY: finite.positive().optional(), flipX: z.boolean().optional() }),
  gameNonSpatialScriptCommand.options[0],
  gameNonSpatialScriptCommand.options[1],
  gameNonSpatialScriptCommand.options[2],
  z.strictObject({ kind: z.literal("spawn"), prefabId: z.string().min(1), x: finite.optional(), y: finite.optional(),
    velocityX: finite.optional(), velocityY: finite.optional() }),
  gameNonSpatialScriptCommand.options[3],
  gameNonSpatialScriptCommand.options[4],
  gameNonSpatialScriptCommand.options[5],
  gameNonSpatialScriptCommand.options[6]
]);

export type GameScriptCommand = z.infer<typeof gameScriptCommand>;

export interface GameScriptCall {
  readonly sourceKey: string;
  readonly stateKey: string;
  readonly entityId: string;
  readonly source: string;
  readonly state: GameSnapshot["scriptState"][string];
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly touching: GameScriptTouching;
  readonly tags: readonly string[];
  readonly props: NonNullable<GameDocument["scenes"][number]["entities"][number]["props"]>;
  readonly rotation: number;
  readonly active: boolean;
  readonly maxCommands: number;
  readonly maxTickMs: number;
}

/** Which sides of an entity's collider rest against a solid at the start of the tick. */
export interface GameScriptTouching {
  readonly down: boolean;
  readonly up: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface GameScriptResult {
  readonly entityId: string;
  readonly state: GameSnapshot["scriptState"][string];
  readonly commands: readonly GameScriptCommand[];
}

export interface GameScriptStats {
  readonly durationMs: number;
  readonly commands: number;
  readonly calls: number;
  readonly byEntity: Readonly<Record<string, { readonly durationMs: number; readonly calls: number }>>;
}

export interface GameScriptBatch {
  readonly results: readonly GameScriptResult[];
  readonly rngState: number;
  readonly stats: GameScriptStats;
}

/** An active entity with a collider or camera, as every script sees it this tick. */
export interface GameScriptWorldEntity {
  readonly id: string;
  readonly source: string;
  readonly x: number;
  readonly y: number;
  readonly tags: readonly string[];
  readonly props: NonNullable<GameDocument["scenes"][number]["entities"][number]["props"]>;
  readonly rotation: number;
  readonly active: boolean;
}

export interface GameScriptInput {
  readonly tick: number;
  readonly pressed: readonly string[];
  readonly justPressed: readonly string[];
  readonly events: readonly unknown[];
  readonly world: readonly GameScriptWorldEntity[];
}

export interface GameScriptRunner {
  run(calls: readonly GameScriptCall[], input: GameScriptInput, rngState: number, world?: readonly ScriptWorldEntity[]): GameScriptBatch;
  retain?(stateKeys: ReadonlySet<string>): void;
  dispose(): void;
}

export function scriptSourceKey(sceneId: string, entityId: string, behaviorIndex: number): string {
  return JSON.stringify([sceneId, entityId, behaviorIndex]);
}

export function hasGameScripts(document: GameDocument): boolean {
  return document.scenes.some((scene) => scene.entities.some((entity) => entity.behaviors.some((behavior) => behavior.kind === "script")));
}

function evaluate(context: QuickJSContext, code: string): unknown {
  const value = scriptHandleResult(context, context.evalCode(code, "game-script.js", { type: "global" }));
  try { return context.dump(value); } finally { value.dispose(); }
}

function initializeContext(context: QuickJSContext, seed: number, helpers: string): QuickJSHandle {
  return scriptHandleResult(context, context.evalCode(`
    globalThis.Date = undefined;
    Object.defineProperty(globalThis, "__gameRandom", {
      value: (() => {
        let state = ${seed >>> 0};
        const random = () => {
          state = (Math.imul(1664525, state) + 1013904223) >>> 0;
          return state / 4294967296;
        };
        Object.defineProperty(random, "state", { get: () => state });
        return random;
      })(), writable: false, configurable: false
    });
    Object.defineProperty(Math, "random", { value: __gameRandom, writable: false, configurable: false });
    ${helpers}
  `, "game-transport.js", { type: "global" }));
}

function assertBeforeDeadline(deadline: number, budget: string): void {
  if (performance.now() >= deadline) {
    throw new Error(`Game script interrupted: ${budget} budget exceeded`);
  }
}

/** Only proven input-only functions may retain their context between calls. */
export interface IsolatedScriptCall {
  readonly sourceKey: string;
  readonly stateKey: string;
  readonly entityId: string;
  readonly source: string;
  readonly state: GameSnapshot["scriptState"][string];
  readonly maxCommands: number;
  readonly maxTickMs: number;
}

export interface IsolatedScriptInput {
  readonly tick: number;
  readonly world: readonly ScriptWorldEntity[];
}

export interface IsolatedScriptRunner<Call extends IsolatedScriptCall, Input extends IsolatedScriptInput, Command> {
  run(calls: readonly Call[], input: Input, rngState: number, world?: readonly ScriptWorldEntity[]): {
    readonly results: readonly { readonly entityId: string; readonly state: GameSnapshot["scriptState"][string]; readonly commands: readonly Command[] }[];
    readonly rngState: number;
    readonly stats: GameScriptStats;
  };
  retain?(stateKeys: ReadonlySet<string>): void;
  dispose(): void;
}

interface ScriptRealm {
  readonly sourceKey: string;
  readonly context: QuickJSContext;
  readonly invoke: QuickJSHandle;
  readonly defineData: QuickJSHandle;
  readonly queryJson: QuickJSHandle;
  readonly worldGetter: QuickJSHandle;
  setWorldReader(reader: (() => QuickJSHandle) | undefined): void;
}

function disposeRealm(realm: ScriptRealm): void {
  realm.setWorldReader(undefined);
  realm.worldGetter.dispose();
  realm.queryJson.dispose();
  realm.defineData.dispose();
  realm.invoke.dispose();
  realm.context.dispose();
}

interface ScriptDefinitions {
  readonly entrySceneId?: string;
  readonly scenes: readonly { readonly id: string; readonly entities: readonly {
    readonly id: string; readonly behaviors: readonly { readonly kind: string; readonly source?: string }[]
  }[] }[];
}

/** Bounds the validated entry-scene realms held until the first batch, about 30 KiB each. */
const PREPARED_REALM_LIMIT = 64;

export async function prepareIsolatedGameScripts<Call extends IsolatedScriptCall, Input extends IsolatedScriptInput, Command>(
  document: ScriptDefinitions,
  commandSchema: z.ZodType<Command>,
  payloadExpression: string
): Promise<IsolatedScriptRunner<Call, Input, Command>> {
  const resultSchema = z.strictObject({ state: z.json(), commands: z.array(commandSchema) });
  const envelopeSchema = z.object({ value: resultSchema, rngState: z.number().int().nonnegative() });
  const [{ newQuickJSWASMModuleFromVariant }, quickJsVariantModule] = await Promise.all([
    import("quickjs-emscripten-core"),
    import("@jitl/quickjs-ng-wasmfile-release-sync")
  ]);
  const variant = (quickJsVariantModule as unknown as { default: Parameters<typeof newQuickJSWASMModuleFromVariant>[0] }).default;
  const module = await newQuickJSWASMModuleFromVariant(variant);
  const runtime: QuickJSRuntime = module.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const sources = new Map<string, string>();
  const persistentSources = new Set<string>();
  const realms = new Map<string, ScriptRealm>();
  // Validated entry-scene realms, kept so the first tick does not compile every proven-safe script inside its budget.
  const prepared = new Map<string, ScriptRealm>();
  const releasePrepared = (): void => {
    for (const realm of prepared.values()) { disposeRealm(realm); }
    prepared.clear();
  };
  const disposeRealms = (): void => {
    for (const realm of realms.values()) { disposeRealm(realm); }
    realms.clear();
    releasePrepared();
  };
  const retain = (keys: ReadonlySet<string>): void => {
    for (const [key, realm] of realms) {
      if (!keys.has(key)) { disposeRealm(realm); realms.delete(key); }
    }
  };
  const createRealm = (sourceKey: string, source: string, seed: number, persistent: boolean): ScriptRealm => {
    const context = runtime.newContext();
    let invoke: QuickJSHandle | undefined;
    let defineData: QuickJSHandle | undefined;
    let queryJson: QuickJSHandle | undefined;
    let worldGetter: QuickJSHandle | undefined;
    let worldReader: (() => QuickJSHandle) | undefined;
    try {
      worldGetter = persistent ? context.newFunction("legacyWorld", () => {
        if (!worldReader) { throw new Error("Legacy world read outside an active script call"); }
        return worldReader();
      }) : context.undefined.dup();
      // Capture pristine helpers together, without introducing bindings visible to user source.
      const helpers = initializeContext(context, seed, `[
      ((define) => (object, key, value) => {
        define(object, key, { value, writable: true, enumerable: true, configurable: true });
      })(Object.defineProperty),
      ((stringify) => (value) => {
        const json = stringify(value);
        if (typeof json !== "string" || json.length > 4096) { throw new Error("world query arguments exceed 4096 characters or are not JSON"); }
        return json;
      })(JSON.stringify),
      ((defineProperty) => (data, getWorld, rngState) => {
        ${persistent ? "" : "data = JSON.parse(data);"}
        const payload = ${payloadExpression};
        ${persistent ? `defineProperty(payload, "world", {
          enumerable: true, configurable: true, get: getWorld,
          set(value) { defineProperty(this, "world", { value, writable: true, enumerable: true, configurable: true }); }
        });` : ""}
        const value = __gameScript(payload);
        return JSON.stringify({ value, rngState: ${persistent ? "rngState" : "__gameRandom.state"} });
      })(Object.defineProperty)]`);
      try {
        defineData = context.getProp(helpers, 0);
        queryJson = context.getProp(helpers, 1);
        invoke = context.getProp(helpers, 2);
      } finally { helpers.dispose(); }
      if (evaluate(context, `globalThis.__gameScript = (${source}); typeof __gameScript`) !== "function") {
        throw new Error(`Game script ${sourceKey} must be a function expression`);
      }
      return { sourceKey, context, invoke, defineData, queryJson, worldGetter, setWorldReader: (reader) => { worldReader = reader; } };
    } catch (error) {
      worldGetter?.dispose(); queryJson?.dispose(); defineData?.dispose(); invoke?.dispose(); context.dispose(); throw error;
    }
  };
  try {
    for (const scene of document.scenes) {
      for (const entity of scene.entities) {
        entity.behaviors.forEach((behavior, index) => {
          if (behavior.kind !== "script" || behavior.source === undefined) {
            return;
          }
          const key = scriptSourceKey(scene.id, entity.id, index);
          try {
            const deadline = performance.now() + 100;
            runtime.setInterruptHandler(() => performance.now() >= deadline);
            const persistent = canPersistGameScript(behavior.source);
            const realm = createRealm(key, behavior.source, 0, persistent);
            if (persistent) {
              persistentSources.add(key);
            }
            // Inactive scenes and prefab definitions are validated without retaining their realms.
            if (persistent && scene.id === document.entrySceneId && prepared.size < PREPARED_REALM_LIMIT) { prepared.set(key, realm); }
            else { disposeRealm(realm); }
          } catch (error) {
            throw new Error(`Game script ${key} could not be prepared: ${error instanceof Error ? error.message : String(error)}`);
          }
          sources.set(key, behavior.source);
        });
      }
    }
    return {
      retain,
      run(calls: readonly Call[], input: Input, rngState: number, world?: readonly ScriptWorldEntity[]): ReturnType<IsolatedScriptRunner<Call, Input, Command>["run"]> {
        try {
          retain(new Set(calls.map((call) => call.stateKey)));
          if (calls.length === 0) {
            return { results: [], rngState, stats: { durationMs: 0, commands: 0, calls: 0, byEntity: {} } };
          }
          const started = performance.now();
          const batchDeadline = started + 50;
          // This limits the logical tick payload; each isolated call gets its own JSON copy.
          const serialized = JSON.stringify({ calls, input, rngState });
          const inputBytes = encoder.encode(serialized).byteLength;
          if (inputBytes > 64 * 1024) {
            throw new Error(`Game script input exceeds 64 KiB (${inputBytes} bytes, ${calls.length} calls, tick ${input.tick})`);
          }
          const batchBudget = `batch 50 ms at tick ${input.tick}`;
          assertBeforeDeadline(batchDeadline, batchBudget);
          let fullInputJson: string | undefined;
          const inputJson = (): string => fullInputJson ??= JSON.stringify(input);
          let persistentInputJson: string | undefined;
          const inputJsonWithoutWorld = (): string => {
            if (persistentInputJson === undefined) {
              const { world: _world, ...withoutWorld } = input;
              persistentInputJson = JSON.stringify(withoutWorld);
            }
            return persistentInputJson;
          };
          let hostWorld: ScriptWorldSnapshot | undefined;
          const getHostWorld = (): ScriptWorldSnapshot => hostWorld ??= new ScriptWorldSnapshot(world ?? input.world);
          let legacyWorld: unknown;
          let legacyWorldReady = false;
          const readLegacyWorld = (): unknown => {
            if (!legacyWorldReady) {
              // The logical payload already captured the tick-start world. Parse it only on demand.
              const captured: unknown = JSON.parse(serialized);
              if (captured === null || typeof captured !== "object" || !("input" in captured)
                || captured.input === null || typeof captured.input !== "object" || !("world" in captured.input)) {
                throw new Error("Script input world is missing");
              }
              legacyWorld = captured.input.world;
              legacyWorldReady = true;
            }
            return legacyWorld;
          };
          let nextRngState = rngState;
          let serializedResultsBytes = 0;
          let commandCount = 0;
          const byEntity: Record<string, { durationMs: number; calls: number }> = Object.create(null);
          const results: { entityId: string; state: GameSnapshot["scriptState"][string]; commands: Command[] }[] = [];
          for (const call of calls) {
            assertBeforeDeadline(batchDeadline, batchBudget);
            const source = sources.get(call.sourceKey);
            if (source === undefined) {
              throw new Error(`Game script source ${call.sourceKey} is missing for ${call.entityId} at tick ${input.tick}`);
            }
            const callStarted = performance.now();
            const deadline = Math.min(batchDeadline, callStarted + call.maxTickMs);
            const checkCallDeadline = (): void => {
              assertBeforeDeadline(batchDeadline, batchBudget);
              assertBeforeDeadline(deadline, `call ${call.maxTickMs} ms for ${call.entityId} at tick ${input.tick}`);
            };
            runtime.setInterruptHandler(() => performance.now() >= deadline);
            const persistent = persistentSources.has(call.sourceKey);
            let realm = realms.get(call.stateKey);
            let worldHandle: QuickJSHandle | undefined;
            let worldCall: ReturnType<ScriptWorldSnapshot["install"]> | undefined;
            try {
              if (realm && realm.sourceKey !== call.sourceKey) {
                disposeRealm(realm); realms.delete(call.stateKey); realm = undefined;
              }
              if (!realm && persistent) {
                realm = prepared.get(call.sourceKey);
                prepared.delete(call.sourceKey);
              }
              realm ??= createRealm(call.sourceKey, source, nextRngState, persistent);
              if (persistent) { realms.set(call.stateKey, realm); }
              const { context, invoke, defineData, worldGetter } = realm;
              if (!persistent) { worldCall = getHostWorld().install(context, checkCallDeadline, realm.defineData, realm.queryJson); }
              checkCallDeadline();
              // Byte-identical to JSON.stringify({ call, input, rngState }), without re-serializing the shared input per call.
              const data = `{"call":${JSON.stringify(call)},"input":${persistent ? inputJsonWithoutWorld() : inputJson()},"rngState":${JSON.stringify(nextRngState)}}`;
              checkCallDeadline();
              const normalized: unknown = persistent ? JSON.parse(data) : data;
              let argument: QuickJSHandle | undefined;
              let seed: QuickJSHandle | undefined;
              let output: unknown;
              try {
                argument = gameScriptValue(context, normalized, defineData, persistent);
                seed = context.newNumber(nextRngState);
                realm.setWorldReader(() => {
                  checkCallDeadline();
                  worldHandle ??= gameScriptValue(context, readLegacyWorld(), defineData, true);
                  checkCallDeadline();
                  return worldHandle.dup();
                });
                const value = scriptHandleResult(context, context.callFunction(invoke, context.undefined, argument, worldGetter, seed));
                try { output = context.dump(value); } finally { value.dispose(); }
                worldCall?.assertWithinLimit();
              } finally {
                realm.setWorldReader(undefined);
                argument?.dispose(); seed?.dispose();
              }
              if (typeof output !== "string") {
                throw new Error("Output is not JSON");
              }
              checkCallDeadline();
              const rawOutputBytes = encoder.encode(output).byteLength;
              if (rawOutputBytes > 64 * 1024) {
                throw new Error(`Output exceeds 64 KiB (${rawOutputBytes} bytes in call ${results.length + 1})`);
              }
              const parsed: unknown = JSON.parse(output);
              const envelope = envelopeSchema.parse(parsed);
              if (envelope.value.commands.length > call.maxCommands) {
                throw new Error(`Game script command limit exceeded for ${call.entityId}`);
              }
              const itemBytes = encoder.encode(JSON.stringify({ entityId: call.entityId, value: envelope.value })).byteLength;
              serializedResultsBytes += itemBytes + (results.length > 0 ? 1 : 0);
              const outputBytes = encoder.encode(JSON.stringify({ results: [], rngState: envelope.rngState })).byteLength + serializedResultsBytes;
              if (outputBytes > 64 * 1024) {
                throw new Error(`Output exceeds 64 KiB (${outputBytes} bytes across ${results.length + 1} calls)`);
              }
              checkCallDeadline();
              commandCount += envelope.value.commands.length;
              nextRngState = envelope.rngState;
              results.push({ entityId: call.entityId, state: envelope.value.state, commands: envelope.value.commands });
            } catch (error) {
              // A failed batch cannot retain partially evaluated realms.
              worldHandle?.dispose(); worldHandle = undefined;
              if (!persistent && realm) { disposeRealm(realm); realm = undefined; }
              disposeRealms();
              throw new Error(`Game script ${call.sourceKey} for ${call.entityId} at tick ${input.tick} failed: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
              worldCall?.end();
              worldHandle?.dispose();
              if (!persistent && realm) { disposeRealm(realm); }
            }
            checkCallDeadline();
            const previous = byEntity[call.entityId] ?? { durationMs: 0, calls: 0 };
            byEntity[call.entityId] = { durationMs: previous.durationMs + performance.now() - callStarted, calls: previous.calls + 1 };
          }
          assertBeforeDeadline(batchDeadline, batchBudget);
          return { results, rngState: nextRngState, stats: { durationMs: performance.now() - started, commands: commandCount, calls: calls.length, byEntity } };
        } catch (error) {
          disposeRealms();
          throw error;
        } finally {
          // Entities without a call in the first batch were not active at start. Later activations compile on demand.
          releasePrepared();
        }
      },
      dispose(): void {
        disposeRealms();
        runtime.dispose();
      }
    };
  } catch (error) {
    disposeRealms();
    runtime.dispose();
    throw error;
  }
}

export function prepareGameScripts(document: GameDocument): Promise<GameScriptRunner> {
  return prepareIsolatedGameScripts<GameScriptCall, GameScriptInput, GameScriptCommand>(document, gameScriptCommand, `{
    tick: data.input.tick, pressed: data.input.pressed, justPressed: data.input.justPressed,
    events: data.input.events, entity: {
      id: data.call.entityId, source: data.call.source, x: data.call.x, y: data.call.y,
      velocityX: data.call.velocityX, velocityY: data.call.velocityY, touching: data.call.touching,
      tags: data.call.tags, props: data.call.props, rotation: data.call.rotation, active: data.call.active
    }, world: data.input.world, state: data.call.state, random: __gameRandom
  }`);
}
