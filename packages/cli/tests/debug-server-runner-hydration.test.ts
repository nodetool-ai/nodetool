/**
 * The debug harness must hydrate `propertyTypes`, not just node flags.
 *
 * `ExecutionSession` only resolves `propertyTypes` when handed a
 * `resolveNodeType`; with a registry alone it hydrates flags and leaves that
 * map empty. Correlation analysis reads list-ness only from that map, so
 * without the resolver every `list[...]` handle looks scalar and a stream
 * arriving on one collapses to empty scope — the node runs once on the last
 * value. `Directed Film to Timeline` animated one shot of N under `debug` and
 * all N under `workflows run`, which is backwards for a harness whose job is
 * to reproduce a run.
 *
 * Asserted structurally rather than by executing a graph: the whole point is
 * the option handed to the session, and a real run here would need the full
 * node registry.
 *
 * The same harness also reports what nodes emit on the run's context, which a
 * live host relays and RunResult.messages leaves out.
 */
import { describe, expect, it, vi } from "vitest";

const created: Record<string, unknown>[] = [];

/** What a run emits on its context, and what the runner retains of it. */
const run = {
  emitted: [] as Record<string, unknown>[],
  retained: [] as Record<string, unknown>[]
};

vi.mock("@nodetool-ai/execution", () => ({
  ExecutionSession: {
    create: async (options: Record<string, unknown>) => {
      created.push(options);
      const context = options.context as {
        emit: (message: Record<string, unknown>) => void;
      };
      for (const message of run.emitted) context.emit(message);
      return {
        result: Promise.resolve({
          status: "completed",
          messages: run.retained,
          outputs: {}
        }),
        messages: (async function* () {})()
      };
    }
  }
}));
vi.mock("@nodetool-ai/execution/debug", () => ({ summarizeInterventions: () => null }));
vi.mock("@nodetool-ai/config", () => ({ getDefaultAssetsPath: () => "/tmp/assets" }));
vi.mock("@nodetool-ai/models", () => ({
  getSecret: async () => undefined,
  Project: { ensurePersonal: async () => ({ id: "personal:1" }) }
}));
vi.mock("@nodetool-ai/runtime", () => ({
  ProcessingContext: class {
    private readonly listeners = new Set<(message: unknown) => void>();
    addMessageListener(listener: (message: unknown) => void): () => void {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    emit(message: unknown): void {
      for (const listener of this.listeners) listener(message);
    }
  },
  FileStorageAdapter: class {}
}));
vi.mock("@nodetool-ai/websocket", () => ({ resolveWorkflowWorkspace: async () => null }));
vi.mock("@nodetool-ai/node-sdk", () => ({
  createGraphNodeTypeResolver: () => ({ resolveNodeType: async () => ({}) })
}));
vi.mock("../src/node-registry.js", () => ({ buildFullRegistry: () => ({}) }));
vi.mock("../src/supervisor.js", () => ({
  createSupervisorHandle: async () => null,
  recordSupervisorCost: async () => undefined,
  streamInterventionLines: () => Promise.resolve()
}));
vi.mock("../src/debug/collector.js", () => ({
  collectExecutionSummary: () => ({ nodes: [], logs: [], outputs: {}, errors: [] })
}));
vi.mock("../src/debug/trace.js", () => ({ readTraceSummary: async () => null }));

describe("debug server runner hydration", () => {
  it("hands ExecutionSession a resolveNodeType so propertyTypes get filled", async () => {
    const { runOnServer } = await import("../src/debug/server-runner.js");
    created.length = 0;

    await runOnServer({
      graph: { nodes: [], edges: [] },
      workflowId: null,
      params: {}
    } as never);

    expect(created).toHaveLength(1);
    // Without this the run silently differs from `workflows run`.
    expect(typeof created[0].resolveNodeType).toBe("function");
  });

  it("reports what nodes emitted on the context, not only what the runner retained", async () => {
    const { runOnServer } = await import("../src/debug/server-runner.js");
    const toolCall = {
      type: "tool_call_update",
      node_id: "research_agent",
      tool_call_id: "call_1",
      name: "browser"
    };
    const audio = {
      type: "output_update",
      node_id: "synth",
      value: { type: "chunk", content_type: "audio", content: "AAAA" }
    };
    const done = { type: "job_update", status: "completed" };
    run.emitted = [toolCall, audio, done];
    run.retained = [done];

    const { rawMessages } = await runOnServer({
      graph: { nodes: [], edges: [] },
      workflowId: null,
      params: {}
    } as never);

    // The Agent node's tool call reaches the report in emit order; the audio
    // samples stay out, as they do from the runner's own retention.
    expect(rawMessages).toEqual([toolCall, done]);
  });
});
