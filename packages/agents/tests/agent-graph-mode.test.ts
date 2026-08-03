/**
 * `Agent({ graph })` — workflows as agents.
 *
 * The branch has two jobs and both are tested against real execution: on a
 * clean graph it must be indistinguishable from a bare `WorkflowRunner`, and
 * on a broken one the supervisor's verdict must actually reach the run and
 * show up in the message stream. The supervising model is a scripted
 * provider — no network.
 */

import { describe, it, expect, vi } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  hydrateGraphNodeFlags,
  prop
} from "@nodetool-ai/node-sdk";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { GraphData, ProcessingMessage } from "@nodetool-ai/protocol";
import { Agent } from "../src/agent.js";

/** Any model the pricing catalog knows — reservation fails closed otherwise. */
const PRICED_MODEL = "gpt-4o-mini";

class Value extends BaseNode {
  static readonly nodeType = "test.graph.Value";
  static readonly title = "Value";
  static readonly description = "Constant value";

  @prop({ type: "int", default: 0 })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value };
  }
}

class Double extends BaseNode {
  static readonly nodeType = "test.graph.Double";
  static readonly title = "Double";
  static readonly description = "Doubles a number";

  @prop({ type: "int", default: 0 })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: Number(this.value ?? 0) * 2 };
  }
}

class Boom extends BaseNode {
  static readonly nodeType = "test.graph.Boom";
  static readonly title = "Boom";
  static readonly description = "Always throws";

  @prop({ type: "int", default: 0 })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    throw new Error("node exploded");
  }
}

function buildRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(Value);
  registry.register(Double);
  registry.register(Boom);
  return registry;
}

function cleanGraph(): GraphData {
  return {
    nodes: [
      { id: "v", type: "test.graph.Value", properties: { value: 21 } },
      { id: "d", type: "test.graph.Double", properties: {} }
    ],
    edges: [
      {
        id: "e1",
        source: "v",
        sourceHandle: "output",
        target: "d",
        targetHandle: "value"
      }
    ]
  } as unknown as GraphData;
}

function brokenGraph(): GraphData {
  return {
    nodes: [
      { id: "v", type: "test.graph.Value", properties: { value: 1 } },
      { id: "b", type: "test.graph.Boom", properties: {} }
    ],
    edges: [
      {
        id: "e1",
        source: "v",
        sourceHandle: "output",
        target: "b",
        targetHandle: "value"
      }
    ]
  } as unknown as GraphData;
}

function makeContext(): ProcessingContext {
  return new ProcessingContext({
    jobId: `job_${Math.random().toString(36).slice(2)}`,
    workflowId: null,
    userId: "1"
  });
}

type ScriptedCall = { name: string; args: Record<string, unknown> };

/**
 * Replays scripted tool calls through the real `BaseProvider.generateLoop`,
 * the same double `supervisor-agent.test.ts` uses.
 */
function scriptedProvider(turns: ScriptedCall[][]): BaseProvider {
  let turn = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    generateMessages: async function* () {
      const calls = turns[turn] ?? [];
      turn++;
      for (const call of calls) {
        yield { id: `tc_${turn}_${call.name}`, name: call.name, args: call.args };
      }
      if (calls.length === 0) {
        yield { type: "chunk" as const, content: "", done: true };
      }
    },
    async *generateMessagesTraced(args: unknown) {
      yield* (
        this as unknown as {
          generateMessages: (a: unknown) => AsyncGenerator<unknown>;
        }
      ).generateMessages(args);
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as unknown as {
          generateLoop: (a: unknown) => AsyncGenerator<unknown>;
        }
      ).generateLoop.call(this, args);
    },
    _admitTurn: (BaseProvider.prototype as unknown as Record<string, unknown>)[
      "_admitTurn"
    ],
    generateMessage: vi.fn(),
    getContainerEnv: () => ({}),
    isContextLengthError: () => false,
    setMessageEmitter: () => {}
  } as unknown as BaseProvider;
}

/** A provider that must never be called. */
function unusedProvider(): BaseProvider {
  return scriptedProvider([]);
}

async function collect(
  agent: Agent,
  context: ProcessingContext,
  signal?: AbortSignal
): Promise<ProcessingMessage[]> {
  const messages: ProcessingMessage[] = [];
  for await (const message of agent.execute(
    context,
    signal ? { signal } : undefined
  )) {
    messages.push(message);
  }
  return messages;
}

describe("Agent({ graph }) — clean run", () => {
  it("returns the outputs a bare WorkflowRunner produces", async () => {
    const registry = buildRegistry();

    const baselineContext = makeContext();
    const runner = new WorkflowRunner("baseline", {
      resolveExecutor: (node) => registry.resolve(node),
      executionContext: baselineContext
    });
    const baseline = await runner.run(
      { job_id: "baseline" },
      hydrateGraphNodeFlags(cleanGraph(), registry)
    );

    const agent = new Agent({
      name: "graph-agent",
      objective: "run the workflow",
      provider: unusedProvider(),
      model: PRICED_MODEL,
      registry,
      graph: cleanGraph()
    });
    await collect(agent, makeContext());

    expect(baseline.status).toBe("completed");
    expect(agent.getResults()).toEqual(baseline.outputs);
    expect(agent.getResults()).toEqual({ d: [42] });
  });

  it("forwards the run's messages to the caller's context", async () => {
    const registry = buildRegistry();
    const context = makeContext();
    const seen: ProcessingMessage[] = [];
    context.addMessageListener((message) => seen.push(message));

    const agent = new Agent({
      name: "graph-agent",
      objective: "run the workflow",
      provider: unusedProvider(),
      model: PRICED_MODEL,
      registry,
      graph: cleanGraph()
    });
    const yielded = await collect(agent, context);

    expect(yielded.some((m) => m.type === "node_update")).toBe(true);
    expect(seen.some((m) => m.type === "node_update")).toBe(true);
  });

  it("throws when the run fails and no supervisor can recover it", async () => {
    const registry = buildRegistry();
    const agent = new Agent({
      name: "graph-agent",
      objective: "run the workflow",
      provider: unusedProvider(),
      model: PRICED_MODEL,
      registry,
      graph: brokenGraph()
    });

    await expect(collect(agent, makeContext())).rejects.toThrow(
      /node exploded/
    );
  });
});

describe("Agent({ graph, supervise: true })", () => {
  it("applies the supervisor's verdict and surfaces the intervention", async () => {
    const registry = buildRegistry();
    const provider = scriptedProvider([
      [
        {
          name: "finish_step",
          args: {
            result: { action: "skip", rationale: "one item, not the run" }
          }
        }
      ]
    ]);

    const agent = new Agent({
      name: "graph-agent",
      objective: "run the workflow",
      provider,
      model: PRICED_MODEL,
      registry,
      graph: brokenGraph(),
      supervise: true
    });

    const messages = await collect(agent, makeContext());

    const escalation = messages.find(
      (m) => m.type === "supervisor_escalation"
    ) as { escalation: { nodeId: string } } | undefined;
    expect(escalation?.escalation.nodeId).toBe("b");

    const decision = messages.find((m) => m.type === "supervisor_decision") as
      | { verdict: { action: string }; decided_by: string }
      | undefined;
    expect(decision?.verdict.action).toBe("skip");
    expect(decision?.decided_by).toBe("agent");

    // The verdict reached the run: the invocation was retired without emitting
    // (an empty output list for the node), and the run completed instead of
    // failing on "node exploded".
    expect(agent.getResults()).toEqual({ b: [] });
  });

  it("fails the run when the supervisor answers with fail", async () => {
    const registry = buildRegistry();
    const provider = scriptedProvider([
      [
        {
          name: "finish_step",
          args: { result: { action: "fail", rationale: "unrecoverable" } }
        }
      ]
    ]);

    const agent = new Agent({
      name: "graph-agent",
      objective: "run the workflow",
      provider,
      model: PRICED_MODEL,
      registry,
      graph: brokenGraph(),
      supervise: true
    });

    await expect(collect(agent, makeContext())).rejects.toThrow();
  });

  it("never escalates on a clean run", async () => {
    const registry = buildRegistry();
    const provider = scriptedProvider([]);
    const agent = new Agent({
      name: "graph-agent",
      objective: "run the workflow",
      provider,
      model: PRICED_MODEL,
      registry,
      graph: cleanGraph(),
      supervise: true
    });

    const messages = await collect(agent, makeContext());
    expect(messages.some((m) => m.type.startsWith("supervisor_"))).toBe(false);
    expect(agent.getResults()).toEqual({ d: [42] });
  });
});

describe("Agent({ graph }) — cancellation", () => {
  it("cancels the run when the caller's signal is already aborted", async () => {
    const registry = buildRegistry();
    const controller = new AbortController();
    controller.abort();

    const agent = new Agent({
      name: "graph-agent",
      objective: "run the workflow",
      provider: unusedProvider(),
      model: PRICED_MODEL,
      registry,
      graph: cleanGraph()
    });

    await collect(agent, makeContext(), controller.signal);
    expect(agent.getResults()).not.toEqual({ d: [42] });
  });
});
