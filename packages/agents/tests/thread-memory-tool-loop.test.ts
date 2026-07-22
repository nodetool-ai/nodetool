/**
 * Unit tests for the thread-memory tool-loop eval
 * (`src/evals/surfaces/thread-memory.ts`):
 *   - `createThreadMemoryToolBridge`: headless execution of the real
 *     thread-memory and asset tools against an in-memory DB.
 *   - `THREAD_MEMORY_TOOL_LOOP_CASES`: each case is solvable by a hand-written
 *     scripted tool-call sequence, driven through `runToolLoopEval` exactly
 *     like a real model's tool loop — no network.
 */
import { describe, it, expect, afterEach } from "vitest";
import { ModelObserver } from "@nodetool-ai/models";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createThreadMemoryToolBridge,
  THREAD_MEMORY_TOOL_LOOP_CASES
} from "../src/evals/surfaces/thread-memory.js";
import type { BaseProvider, ProviderStreamItem, ProviderTool } from "@nodetool-ai/runtime";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
  /** Capture the tool's result so a later call can use it. */
  capture?: (result: unknown) => void;
  /** Build args lazily from earlier captures. */
  lazyArgs?: () => Record<string, unknown>;
}

function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        const callArgs = call.lazyArgs ? call.lazyArgs() : call.args;
        yield { id, name: call.name, args: callArgs } as ProviderStreamItem;
        const raw = await toolMap.get(call.name)?.execute?.(callArgs, id);
        if (call.capture) {
          try {
            call.capture(typeof raw === "string" ? JSON.parse(raw) : raw);
          } catch {
            call.capture(raw);
          }
        }
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

afterEach(() => ModelObserver.clear());

describe("createThreadMemoryToolBridge", () => {
  it("generate_image persists an asset that thread_memory_save can reference", async () => {
    const bridge = createThreadMemoryToolBridge();
    const gen = bridge.tools.find((t) => t.name === "generate_image")!;
    const save = bridge.tools.find((t) => t.name === "thread_memory_save")!;

    const generated = (await gen.execute({ prompt: "red fox logo" })) as {
      asset_id: string;
    };
    expect(generated.asset_id).toBeTruthy();

    const saved = (await save.execute({
      content: "Approved logo",
      kind: "resource",
      resources: [{ type: "asset", id: generated.asset_id }]
    })) as { success: boolean; resources: Array<{ id: string; uri?: string }> };
    expect(saved.success).toBe(true);
    expect(saved.resources[0].id).toBe(generated.asset_id);

    const state = bridge.finalState();
    expect(state.memories).toHaveLength(1);
    expect(state.memories[0].resources[0].id).toBe(generated.asset_id);
  });

  it("drops a reference to an asset that doesn't exist", async () => {
    const bridge = createThreadMemoryToolBridge();
    const save = bridge.tools.find((t) => t.name === "thread_memory_save")!;
    const saved = (await save.execute({
      content: "bogus",
      resources: [{ type: "asset", id: "nope" }]
    })) as { resources: unknown[] };
    expect(saved.resources).toHaveLength(0);
  });
});

describe("THREAD_MEMORY_TOOL_LOOP_CASES (scripted provider)", () => {
  it("generate-and-remember passes with a correct tool sequence", async () => {
    const evalCase = THREAD_MEMORY_TOOL_LOOP_CASES.find(
      (c) => c.id === "generate-and-remember"
    )!;
    let assetId = "";
    const provider = createScriptedProvider([
      {
        name: "generate_image",
        args: { prompt: "red fox mascot logo" },
        capture: (r) => {
          assetId = (r as { asset_id: string }).asset_id;
        }
      },
      {
        name: "thread_memory_save",
        args: {},
        lazyArgs: () => ({
          content: "Approved project logo: red fox mascot.",
          kind: "resource",
          resources: [{ type: "asset", id: assetId }]
        })
      }
    ]);

    const report = await runToolLoopEval({
      provider,
      model: "scripted",
      cases: [evalCase],
      maxIterations: 6
    });
    expect(report.cases[0].score).toBe(1);
    expect(report.cases[0].checks.every((c) => c.pass)).toBe(true);
  });

  it("generate-and-remember fails when the memory omits the asset ref", async () => {
    const evalCase = THREAD_MEMORY_TOOL_LOOP_CASES.find(
      (c) => c.id === "generate-and-remember"
    )!;
    const provider = createScriptedProvider([
      { name: "generate_image", args: { prompt: "logo" } },
      {
        name: "thread_memory_save",
        args: { content: "A logo, but I forgot to reference the asset." }
      }
    ]);
    const report = await runToolLoopEval({
      provider,
      model: "scripted",
      cases: [evalCase],
      maxIterations: 6
    });
    // The loop ran fine (accepted), but the final-state predicate (a memory
    // references an asset) must fail, so the case does not fully score.
    expect(report.cases[0].score).toBeLessThan(1);
    const assetCheck = report.cases[0].checks.find((c) =>
      c.name.includes("references a generated asset")
    );
    expect(assetCheck?.pass).toBe(false);
  });

  it("recall-existing passes by listing the seeded memory", async () => {
    const evalCase = THREAD_MEMORY_TOOL_LOOP_CASES.find(
      (c) => c.id === "recall-existing"
    )!;
    const provider = createScriptedProvider([
      { name: "thread_memory_list", args: {} }
    ]);
    const report = await runToolLoopEval({
      provider,
      model: "scripted",
      cases: [evalCase],
      maxIterations: 4
    });
    expect(report.cases[0].score).toBe(1);
  });
});
