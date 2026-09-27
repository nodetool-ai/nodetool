import type { QuickJSContext, QuickJSRuntime } from "quickjs-emscripten-core";
import { z } from "zod";
import type { GameDocument, GameSnapshot } from "@nodetool-ai/protocol";

const encoder = new TextEncoder();
const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const command = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("setVelocity"), x: finite, y: finite }),
  z.strictObject({ kind: z.literal("setPosition"), x: finite, y: finite }),
  z.strictObject({ kind: z.literal("setVisual"), tint: color.optional(), opacity: finite.min(0).max(1).optional(),
    rotation: finite.optional(), scaleX: finite.positive().optional(), scaleY: finite.positive().optional() }),
  z.strictObject({ kind: z.literal("hud"), id: z.string().min(1).max(64), text: z.string().max(256), x: finite, y: finite,
    size: finite.positive().max(256).optional(), color: color.optional(), align: z.enum(["left", "center", "right"]).optional(),
    fontId: z.string().min(1).optional() }),
  z.strictObject({ kind: z.literal("emit"), event: z.string().min(1).max(128) }),
  z.strictObject({ kind: z.literal("spawn"), prefabId: z.string().min(1), x: finite.optional(), y: finite.optional(),
    velocityX: finite.optional(), velocityY: finite.optional() }),
  z.strictObject({ kind: z.literal("despawn"), entityId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("sceneTransition"), sceneId: z.string().min(1) })
]);

const result = z.strictObject({ state: z.json(), commands: z.array(command) });
export type GameScriptCommand = z.infer<typeof command>;

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

/** An active entity with a collider or camera, as every script sees it this tick. */
export interface GameScriptWorldEntity {
  readonly id: string;
  readonly source: string;
  readonly x: number;
  readonly y: number;
}

export interface GameScriptInput {
  readonly tick: number;
  readonly pressed: readonly string[];
  readonly justPressed: readonly string[];
  readonly events: readonly unknown[];
  readonly world: readonly GameScriptWorldEntity[];
}

export interface GameScriptRunner {
  run(calls: readonly GameScriptCall[], input: GameScriptInput, rngState: number): GameScriptBatch;
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

function initializeContext(context: QuickJSContext, seed: number): void {
  evaluate(context, `
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
  `);
}

function assertBeforeDeadline(deadline: number, budget: string): void {
  if (performance.now() >= deadline) {
    throw new Error(`Game script interrupted: ${budget} budget exceeded`);
  }
}

/** Script calls use fresh contexts so only returned state and RNG survive a tick. */
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
  const sources = new Map<string, string>();
  try {
    for (const scene of document.scenes) {
      for (const entity of scene.entities) {
        entity.behaviors.forEach((behavior, index) => {
          if (behavior.kind !== "script") {
            return;
          }
          const key = scriptSourceKey(scene.id, entity.id, index);
          const context = runtime.newContext();
          try {
            const deadline = performance.now() + 100;
            runtime.setInterruptHandler(() => performance.now() >= deadline);
            initializeContext(context, 0);
            if (evaluate(context, `globalThis.__gameScript = (${behavior.source}); typeof __gameScript`) !== "function") {
              throw new Error(`Game script ${key} must be a function expression`);
            }
          } catch (error) {
            throw new Error(`Game script ${key} could not be prepared: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            context.dispose();
          }
          sources.set(key, behavior.source);
        });
      }
    }
    return {
      run(calls, input, rngState): GameScriptBatch {
        if (calls.length === 0) {
          return { results: [], rngState, stats: { durationMs: 0, commands: 0, calls: 0 } };
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
        let nextRngState = rngState;
        let serializedResultsBytes = 0;
        let commandCount = 0;
        const results: GameScriptResult[] = [];
        for (const call of calls) {
          assertBeforeDeadline(batchDeadline, batchBudget);
          const source = sources.get(call.sourceKey);
          if (source === undefined) {
            throw new Error(`Game script source ${call.sourceKey} is missing for ${call.entityId} at tick ${input.tick}`);
          }
          const deadline = Math.min(batchDeadline, performance.now() + call.maxTickMs);
          const checkCallDeadline = (): void => {
            assertBeforeDeadline(batchDeadline, batchBudget);
            assertBeforeDeadline(deadline, `call ${call.maxTickMs} ms for ${call.entityId} at tick ${input.tick}`);
          };
          runtime.setInterruptHandler(() => performance.now() >= deadline);
          const context = runtime.newContext();
          try {
            initializeContext(context, nextRngState);
            checkCallDeadline();
            if (evaluate(context, `globalThis.__gameScript = (${source}); typeof __gameScript`) !== "function") {
              throw new Error("Source must be a function expression");
            }
            checkCallDeadline();
            const data = JSON.stringify({ call, input, rngState: nextRngState });
            checkCallDeadline();
            const output = evaluate(context, `(() => {
              const data = JSON.parse(${JSON.stringify(data)});
              const value = __gameScript({
                tick: data.input.tick, pressed: data.input.pressed, justPressed: data.input.justPressed,
                events: data.input.events, entity: {
                  id: data.call.entityId, source: data.call.source, x: data.call.x, y: data.call.y,
                  velocityX: data.call.velocityX, velocityY: data.call.velocityY
                }, world: data.input.world, state: data.call.state, random: __gameRandom
              });
              return JSON.stringify({ value, rngState: __gameRandom.state });
            })()`);
            if (typeof output !== "string") {
              throw new Error("Output is not JSON");
            }
            checkCallDeadline();
            const rawOutputBytes = encoder.encode(output).byteLength;
            if (rawOutputBytes > 64 * 1024) {
              throw new Error(`Output exceeds 64 KiB (${rawOutputBytes} bytes in call ${results.length + 1})`);
            }
            const parsed: unknown = JSON.parse(output);
            const envelope = z.object({ value: result, rngState: z.number().int().nonnegative() }).parse(parsed);
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
            throw new Error(`Game script ${call.sourceKey} for ${call.entityId} at tick ${input.tick} failed: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            context.dispose();
          }
          checkCallDeadline();
        }
        assertBeforeDeadline(batchDeadline, batchBudget);
        return { results, rngState: nextRngState, stats: { durationMs: performance.now() - started, commands: commandCount, calls: calls.length } };
      },
      dispose(): void {
        runtime.dispose();
      }
    };
  } catch (error) {
    runtime.dispose();
    throw error;
  }
}
