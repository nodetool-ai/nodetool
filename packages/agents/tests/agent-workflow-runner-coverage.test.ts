import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

/**
 * AgentWorkflowRunner drives the kernel's WorkflowRunner over a planned graph.
 * We mock the kernel so no real actor runtime spins up: a module-level
 * `runBehavior` lets each test decide what `runner.run` does (emit live
 * messages via the intercepted context.emit, resolve a result, reject, etc.),
 * and we capture every constructed runner to inspect the wiring (jobId,
 * resolveExecutor, executionContext).
 */

interface RunnerCtorOpts {
  resolveExecutor: (node: { id: string; type: string }) => unknown;
  executionContext: { emit: (m: ProcessingMessage) => void };
}

interface RunResult {
  status: string;
  outputs: Record<string, unknown>;
  error?: string;
  messages?: ProcessingMessage[];
}

const runnerInstances: Array<{
  jobId: string;
  opts: RunnerCtorOpts;
  runArgs: unknown[];
}> = [];

let runBehavior: (
  ctx: { emit: (m: ProcessingMessage) => void },
  params: unknown,
  graph: unknown
) => Promise<RunResult | undefined>;

vi.mock("@nodetool-ai/kernel", () => ({
  WorkflowRunner: class {
    jobId: string;
    opts: RunnerCtorOpts;
    constructor(jobId: string, opts: RunnerCtorOpts) {
      this.jobId = jobId;
      this.opts = opts;
      runnerInstances.push({ jobId, opts, runArgs: [] });
    }
    async run(params: unknown, graph: unknown): Promise<RunResult | undefined> {
      const inst = runnerInstances[runnerInstances.length - 1];
      inst.runArgs = [params, graph];
      return runBehavior(this.opts.executionContext, params, graph);
    }
  }
}));

const hydrateSpy = vi.fn((g: unknown) => ({ ...(g as object), __hydrated: true }));
vi.mock("@nodetool-ai/node-sdk", () => ({
  hydrateGraphNodeFlags: hydrateSpy
}));

const agentStepCtors: Array<{ node: unknown; opts: unknown }> = [];
vi.mock("../src/agent-step-executor.js", () => ({
  AgentStepExecutor: class {
    constructor(node: unknown, opts: unknown) {
      agentStepCtors.push({ node, opts });
    }
  }
}));

// Import AFTER mocks are registered.
const { AgentWorkflowRunner } = await import("../src/agent-workflow-runner.js");

const emptyGraph = { nodes: [], edges: [] } as any;

function makeOpts(overrides: Record<string, unknown> = {}) {
  const registry = {
    resolve: vi.fn((node: { id: string }) => ({ resolved: node.id }))
  };
  return {
    provider: { provider: "mock" } as any,
    model: "mock-model",
    registry: registry as any,
    tools: [{ name: "t1" }] as any,
    context: createMockContext(),
    ...overrides
  };
}

async function drain(gen: AsyncGenerator<ProcessingMessage>) {
  const out: ProcessingMessage[] = [];
  for await (const m of gen) out.push(m);
  return out;
}

const msg = (type: string, extra: Record<string, unknown> = {}): ProcessingMessage =>
  ({ type, ...extra } as unknown as ProcessingMessage);

beforeEach(() => {
  runnerInstances.length = 0;
  agentStepCtors.length = 0;
  hydrateSpy.mockClear();
  runBehavior = async () => ({ status: "completed", outputs: {} });
});

describe("AgentWorkflowRunner.execute — happy path", () => {
  it("streams kernel-emitted messages live, then a final step_result", async () => {
    runBehavior = async (ctx) => {
      ctx.emit(msg("log_update", { content: "a" }));
      ctx.emit(msg("node_update", { status: "running" }));
      return { status: "completed", outputs: { answer: 42 } };
    };
    const runner = new AgentWorkflowRunner(makeOpts());

    const messages = await drain(runner.execute(emptyGraph));

    expect(messages.map((m) => m.type)).toEqual([
      "log_update",
      "node_update",
      "step_result"
    ]);
    const final = messages[2] as any;
    expect(final.is_task_result).toBe(true);
    expect(final.result).toEqual({ answer: 42 });
    expect(final.step).toMatchObject({ name: "graph_execution", status: "completed" });
  });

  it("does not yield a final step_result when there are no outputs", async () => {
    runBehavior = async () => ({ status: "completed", outputs: {} });
    const runner = new AgentWorkflowRunner(makeOpts());

    const messages = await drain(runner.execute(emptyGraph));

    expect(messages).toEqual([]);
  });

  it("hydrates the graph flags and passes job_id + inputs to run", async () => {
    const inputs = { topic: "cats" };
    const runner = new AgentWorkflowRunner(makeOpts({ inputs }));

    await drain(runner.execute(emptyGraph));

    expect(hydrateSpy).toHaveBeenCalledOnce();
    const inst = runnerInstances[0];
    const [params, graph] = inst.runArgs as [any, any];
    expect(params.job_id).toBe(inst.jobId);
    expect(params.params).toBe(inputs);
    expect(graph.__hydrated).toBe(true);
  });

  it("restores context.emit after execution (delegates to the original)", async () => {
    const opts = makeOpts();
    const orig = opts.context.emit;
    const runner = new AgentWorkflowRunner(opts);

    await drain(runner.execute(emptyGraph));

    orig.mockClear();
    const after = msg("log_update", { content: "post-run" });
    opts.context.emit(after);
    // The restored emit forwards to the original without re-queuing.
    expect(orig).toHaveBeenCalledWith(after);
  });
});

describe("AgentWorkflowRunner.execute — resolveExecutor wiring", () => {
  it("resolves agent-step nodes via AgentStepExecutor and others via the registry", async () => {
    const opts = makeOpts({
      systemPrompt: "be terse",
      maxStepIterations: 5
    });
    const runner = new AgentWorkflowRunner(opts);

    await drain(runner.execute(emptyGraph));

    const resolve = runnerInstances[0].opts.resolveExecutor;

    // Agent-step node → AgentStepExecutor branch.
    resolve({ id: "s1", type: "nodetool.agents.AgentStep" });
    expect(agentStepCtors).toHaveLength(1);
    expect(agentStepCtors[0].node).toMatchObject({ id: "s1" });
    expect(agentStepCtors[0].opts).toMatchObject({
      model: "mock-model",
      systemPrompt: "be terse",
      maxIterations: 5
    });

    // Deterministic node → registry.resolve branch.
    const resolved = resolve({ id: "n2", type: "nodetool.text.Concat" });
    expect(resolved).toEqual({ resolved: "n2" });
    expect(opts.registry.resolve).toHaveBeenCalledWith({
      id: "n2",
      type: "nodetool.text.Concat"
    });
    // No extra AgentStepExecutor was constructed for the deterministic node.
    expect(agentStepCtors).toHaveLength(1);
  });
});

describe("AgentWorkflowRunner.execute — error propagation", () => {
  it("re-throws an Error rejected by runner.run", async () => {
    runBehavior = async () => {
      throw new Error("kernel exploded");
    };
    const runner = new AgentWorkflowRunner(makeOpts());

    await expect(drain(runner.execute(emptyGraph))).rejects.toThrow(
      "kernel exploded"
    );
  });

  it("wraps a non-Error rejection into an Error", async () => {
    runBehavior = async () => {
      throw "string failure";
    };
    const runner = new AgentWorkflowRunner(makeOpts());

    await expect(drain(runner.execute(emptyGraph))).rejects.toThrow(
      "string failure"
    );
  });

  it("still yields buffered messages before throwing on run rejection", async () => {
    runBehavior = async (ctx) => {
      ctx.emit(msg("log_update", { content: "before crash" }));
      throw new Error("boom");
    };
    const runner = new AgentWorkflowRunner(makeOpts());
    const gen = runner.execute(emptyGraph);

    const first = await gen.next();
    expect((first.value as any).type).toBe("log_update");
    await expect(gen.next()).rejects.toThrow("boom");
  });

  it("throws when the run resolves with no result", async () => {
    runBehavior = async () => undefined;
    const runner = new AgentWorkflowRunner(makeOpts());

    await expect(drain(runner.execute(emptyGraph))).rejects.toThrow(
      "Workflow execution produced no result"
    );
  });

  it("throws the result.error when status is failed", async () => {
    runBehavior = async () => ({
      status: "failed",
      outputs: {},
      error: "node blew up"
    });
    const runner = new AgentWorkflowRunner(makeOpts());

    await expect(drain(runner.execute(emptyGraph))).rejects.toThrow(
      "node blew up"
    );
  });

  it("throws a generic message when a failed result has no error string", async () => {
    runBehavior = async () => ({ status: "failed", outputs: {} });
    const runner = new AgentWorkflowRunner(makeOpts());

    await expect(drain(runner.execute(emptyGraph))).rejects.toThrow(
      "Workflow execution failed"
    );
  });

  it("restores context.emit even when run rejects", async () => {
    const opts = makeOpts();
    const orig = opts.context.emit;
    runBehavior = async () => {
      throw new Error("boom");
    };
    const runner = new AgentWorkflowRunner(opts);

    await expect(drain(runner.execute(emptyGraph))).rejects.toThrow("boom");
    orig.mockClear();
    const after = msg("log_update", { content: "post-crash" });
    opts.context.emit(after);
    expect(orig).toHaveBeenCalledWith(after);
  });
});

describe("AgentWorkflowRunner.execute — node error logging", () => {
  it("completes and still yields the final step_result when node_update errors are present", async () => {
    runBehavior = async () => ({
      status: "completed",
      outputs: { ok: true },
      messages: [
        msg("node_update", { status: "error", error: "partial failure" }),
        msg("node_update", { status: "completed" })
      ]
    });
    const runner = new AgentWorkflowRunner(makeOpts());

    const messages = await drain(runner.execute(emptyGraph));

    // Node errors are logged, not thrown; the final step_result is still emitted.
    expect(messages).toHaveLength(1);
    expect((messages[0] as any).type).toBe("step_result");
    expect((messages[0] as any).result).toEqual({ ok: true });
  });

  it("tolerates a completed result with a missing messages array", async () => {
    runBehavior = async () => ({ status: "completed", outputs: { a: 1 } });
    const runner = new AgentWorkflowRunner(makeOpts());

    const messages = await drain(runner.execute(emptyGraph));

    expect((messages[0] as any).result).toEqual({ a: 1 });
  });
});
