import type { QuickJSContext, QuickJSRuntime } from "quickjs-emscripten-core";
import { z } from "zod";
import type { GameDocument, GameSnapshot } from "@nodetool-ai/protocol";

const command = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("setVelocity"), x: z.number().finite(), y: z.number().finite() }),
  z.strictObject({ kind: z.literal("emit"), event: z.string().min(1).max(128) }),
  z.strictObject({ kind: z.literal("spawn"), prefabId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("despawn"), entityId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("sceneTransition"), sceneId: z.string().min(1) })
]);

const result = z.strictObject({ state: z.json(), commands: z.array(command) });
export type GameScriptCommand = z.infer<typeof command>;

export interface GameScriptCall {
  readonly sourceKey: string;
  readonly stateKey: string;
  readonly entityId: string;
  readonly state: GameSnapshot["scriptState"][string];
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly maxCommands: number;
  readonly maxTickMs: number;
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
}

export interface GameScriptBatch {
  readonly results: readonly GameScriptResult[];
  readonly rngState: number;
  readonly stats: GameScriptStats;
}

export interface GameScriptRunner {
  run(calls: readonly GameScriptCall[], input: { tick: number; pressed: readonly string[]; justPressed: readonly string[]; events: readonly unknown[] }, rngState: number): GameScriptBatch;
  dispose(): void;
}

export function scriptSourceKey(sceneId: string, entityId: string, behaviorIndex: number): string {
  return JSON.stringify([sceneId, entityId, behaviorIndex]);
}

export function hasGameScripts(document: GameDocument): boolean {
  return document.scenes.some((scene) => scene.entities.some((entity) => entity.behaviors.some((behavior) => behavior.kind === "script")));
}

function evaluate(context: QuickJSContext, code: string): unknown {
  const evaluation = context.evalCode(code, "game-script.js", { type: "global" });
  if (evaluation.error) {
    const error = context.dump(evaluation.error) as { message?: string };
    evaluation.error.dispose();
    throw new Error(`Game script failed: ${error.message ?? "unknown error"}`);
  }
  const value = context.dump(evaluation.value);
  evaluation.value.dispose();
  return value;
}

/** One isolated QuickJS runtime compiles all scene scripts and receives one bulk call per tick. */
export async function prepareGameScripts(document: GameDocument): Promise<GameScriptRunner> {
  const [{ newQuickJSWASMModuleFromVariant }, quickJsVariantModule] = await Promise.all([
    import("quickjs-emscripten-core"),
    import("@jitl/quickjs-ng-wasmfile-release-sync")
  ]);
  const variant = (quickJsVariantModule as unknown as { default: Parameters<typeof newQuickJSWASMModuleFromVariant>[0] }).default;
  const module = await newQuickJSWASMModuleFromVariant(variant);
  const runtime: QuickJSRuntime = module.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const context = runtime.newContext();
  try {
    runtime.setInterruptHandler(() => false);
    evaluate(context, `
      globalThis.Date = undefined;
      globalThis.__gameRandomState = 0;
      Object.defineProperty(Math, "random", {
        value: () => {
          __gameRandomState = (Math.imul(1664525, __gameRandomState) + 1013904223) >>> 0;
          return __gameRandomState / 4294967296;
        }, writable: false, configurable: false
      });
      globalThis.__gameScripts = Object.create(null);
      globalThis.__gameRun = (calls, input, seed) => {
        __gameRandomState = seed >>> 0;
        const results = calls.map((call) => {
          const value = __gameScripts[call.sourceKey]({
            tick: input.tick, pressed: input.pressed, justPressed: input.justPressed,
            events: input.events, entity: {
              id: call.entityId, x: call.x, y: call.y,
              velocityX: call.velocityX, velocityY: call.velocityY
            }, state: call.state, random: Math.random
          });
          return { entityId: call.entityId, value };
        });
        return JSON.stringify({ results, rngState: __gameRandomState });
      };
    `);
    for (const scene of document.scenes) {
      for (const entity of scene.entities) {
        entity.behaviors.forEach((behavior, index) => {
          if (behavior.kind !== "script") return;
          const deadline = performance.now() + 100;
          runtime.setInterruptHandler(() => performance.now() >= deadline);
          const key = scriptSourceKey(scene.id, entity.id, index);
          evaluate(context, `__gameScripts[${JSON.stringify(key)}] = (${behavior.source});`);
          if (evaluate(context, `typeof __gameScripts[${JSON.stringify(key)}]`) !== "function") {
            throw new Error(`Game script ${key} must be a function expression`);
          }
        });
      }
    }
    return {
      run(calls, input, rngState): GameScriptBatch {
        if (calls.length === 0) return { results: [], rngState, stats: { durationMs: 0, commands: 0, calls: 0 } };
        const serialized = JSON.stringify({ calls, input, rngState });
        if (serialized.length > 64 * 1024) throw new Error("Game script input exceeds 64 KiB");
        const started = performance.now();
        const deadline = started + Math.min(50, ...calls.map((call) => call.maxTickMs));
        runtime.setInterruptHandler(() => performance.now() >= deadline);
        const output = evaluate(context, `(() => { const data = JSON.parse(${JSON.stringify(serialized)}); return __gameRun(data.calls, data.input, data.rngState); })()`);
        const durationMs = performance.now() - started;
        if (typeof output !== "string" || output.length > 64 * 1024) throw new Error("Game script output exceeds 64 KiB");
        const parsed: unknown = JSON.parse(output);
        const envelope = z.object({ results: z.array(z.object({ entityId: z.string(), value: result })), rngState: z.number().int().nonnegative() }).parse(parsed);
        if (envelope.results.length !== calls.length) throw new Error("Game script result count does not match calls");
        let commandCount = 0;
        const results = envelope.results.map((item, index): GameScriptResult => {
          const call = calls[index];
          if (item.entityId !== call.entityId || item.value.commands.length > call.maxCommands) {
            throw new Error(`Game script command limit or entity mismatch for ${call.entityId}`);
          }
          if (item.value.state === undefined) throw new Error(`Game script ${call.entityId} must return state`);
          commandCount += item.value.commands.length;
          return { entityId: item.entityId, state: item.value.state, commands: item.value.commands };
        });
        return { results, rngState: envelope.rngState, stats: { durationMs, commands: commandCount, calls: calls.length } };
      },
      dispose(): void {
        context.dispose();
        runtime.dispose();
      }
    };
  } catch (error) {
    context.dispose();
    runtime.dispose();
    throw error;
  }
}
