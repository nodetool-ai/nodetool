/**
 * The `agents` capability module: `run_subtask` and `run_search`.
 *
 * These two are the exception to the port. `SubAgentTool` owns the depth gate,
 * the child context, the streamed events and the settlement, and the runner
 * constructs one per turn over that turn's provider, model, toolbelt snapshot
 * and forwarder — so the classes stay untouched and the capability is the
 * registry-visible face over them. What has to hold is therefore: the spec
 * matches the class it fronts, the category matches the classification map, a
 * run with no `subAgent` says so, and a real spawn through the capability
 * behaves like a spawn through the class — including the tool-call id the
 * renderer nests child cards under.
 */

import { describe, expect, it, vi } from "vitest";
import { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  AGENT_CAPABILITIES,
  runSearch,
  runSubtask
} from "../src/capabilities/agents.js";
import {
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import type { SubAgentToolRuntime } from "../src/subagent.js";
import {
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "../src/tools/subtask-fields.js";
import { RunSubtaskTool } from "../src/tools/run-subtask-tool.js";
import { RunSearchTool } from "../src/tools/run-search-tool.js";

function makeCtx(): ProcessingContext {
  return new ProcessingContext({ jobId: "test-job", userId: "test" });
}

/**
 * Minimal mock BaseProvider — the same shape `run-subtask-tool.test.ts` uses.
 * It replays a queued sequence of stream events per `generateMessages` call.
 */
function createMockProvider(
  responseSequence: Array<
    Array<
      | { type: "chunk"; content: string; done?: boolean }
      | { id: string; name: string; args: Record<string, unknown> }
    >
  >
) {
  let callIndex = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      const items = responseSequence[callIndex] ?? [];
      callIndex++;
      for (const item of items) {
        yield item;
      }
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false
  } as any;
}

function stubRuntime(
  overrides: Partial<SubAgentToolRuntime> = {}
): SubAgentToolRuntime {
  return {
    provider: createMockProvider([]),
    model: "mock",
    parentTools: () => [],
    forwardMessage: () => {},
    ...overrides
  };
}

describe("the agents capability module", () => {
  it("registers without drift and exports both wire names", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
    const mod = await loadCapabilityModule("agents");
    expect(mod.exports.map((e) => e.spec.name)).toEqual([
      "run_subtask",
      "run_search"
    ]);
  });

  it("classes both as read, exactly as the permission map does", () => {
    for (const entry of AGENT_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
      expect(entry.spec.category).toBe("read");
    }
  });

  it("carries the surface of the classes it fronts", () => {
    const subtask = new RunSubtaskTool(stubRuntime());
    expect(runSubtask.spec.name).toBe(subtask.name);
    expect(runSubtask.spec.description).toBe(subtask.description);
    expect(runSubtask.spec.inputSchema).toEqual(subtask.inputSchema);
    expect(runSubtask.spec.userMessage?.({ description: "Research X" })).toBe(
      subtask.userMessage({ description: "Research X" })
    );

    const search = new RunSearchTool(stubRuntime());
    expect(runSearch.spec.name).toBe(search.name);
    expect(runSearch.spec.description).toBe(search.description);
    expect(runSearch.spec.inputSchema).toEqual(search.inputSchema);
    expect(runSearch.spec.userMessage?.({ query: "where is X" })).toBe(
      search.userMessage({ query: "where is X" })
    );
  });

  it("names the missing field when the run carries no sub-agent runtime", async () => {
    const run = createCapabilityRun({ context: makeCtx(), gate: UNGATED });
    await expect(run.invoke("run_subtask", {})).rejects.toThrow(/`subAgent`/);
    await expect(run.invoke("run_search", {})).rejects.toThrow(/`subAgent`/);
  });

  it("spawns a child loop and nests its events under the parent call", async () => {
    const forwarded: ProcessingMessage[] = [];
    const run = createCapabilityRun({
      context: makeCtx(),
      gate: UNGATED,
      subAgent: stubRuntime({
        provider: createMockProvider([
          [{ type: "chunk", content: "subtask answer", done: true }]
        ]),
        forwardMessage: (m) => {
          forwarded.push(m);
        },
        maxDepth: 3
      })
    });

    const result = await run.invoke("run_subtask", {
      description: "answer-once",
      prompt: "Just say something",
      [TOOL_CALL_ID_FIELD]: "tc_outer"
    });

    expect(result).not.toBeNull();
    const nested = forwarded.find(
      (m) =>
        (m as { parent_tool_call_id?: string }).parent_tool_call_id ===
        "tc_outer"
    ) as { subtask_depth?: number } | undefined;
    expect(nested).toBeDefined();
    expect(nested?.subtask_depth).toBe(1);
  });

  it("refuses a spawn at the recursion limit, like the class does", async () => {
    const context = makeCtx();
    context.set(SUBTASK_DEPTH_KEY, 2);
    const run = createCapabilityRun({
      context,
      gate: UNGATED,
      subAgent: stubRuntime({ maxDepth: 2 })
    });

    const result = (await run.invoke("run_subtask", {
      description: "deep",
      prompt: "Try to recurse"
    })) as Record<string, unknown>;
    expect(result.error).toBe("max_recursion_depth_reached");
    expect(result.max_depth).toBe(2);
  });

  it("returns the search tool's own refusal for an empty query", async () => {
    const run = createCapabilityRun({
      context: makeCtx(),
      gate: UNGATED,
      subAgent: stubRuntime()
    });
    const result = (await run.invoke("run_search", { query: "  " })) as Record<
      string,
      unknown
    >;
    expect(result.error).toBe("missing_query");
  });
});
