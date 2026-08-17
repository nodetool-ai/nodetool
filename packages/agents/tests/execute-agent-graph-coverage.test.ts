import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

/**
 * executeAgentGraph drives a planned graph through `ExecutionSession`, the one
 * facade that constructs the kernel's WorkflowRunner. We mock the facade so no
 * real actor runtime spins up: a module-level `runBehavior` lets each test
 * decide what the run does (emit live messages via the run context, resolve a
 * result, reject), and we capture every created session to inspect the wiring
 * (graph, registry, context, params).
 */

interface MockContext {
  emit: (m: ProcessingMessage) => void;
  addMessageListener: (l: (m: ProcessingMessage) => void) => () => void;
}

interface CreateOptions {
  graph: { nodes: Array<Record<string, unknown>>; edges: unknown[] };
  registry: unknown;
  context: MockContext;
  params: Record<string, unknown>;
  captureMessages: boolean;
}

interface RunResult {
  status: string;
  outputs: Record<string, unknown>;
  error?: string;
  messages?: ProcessingMessage[];
}

const sessionInstances: Array<{
  jobId: string;
  options: CreateOptions;
  cancelCount: number;
}> = [];

let runBehavior: (
  ctx: MockContext,
  params: Record<string, unknown>,
  graph: unknown
) => Promise<RunResult>;

vi.mock("@nodetool-ai/execution", () => {
  /**
   * Mirrors the facade's observable contract: messages emitted on the run
   * context are queued into `messages`, the stream closes once the run
   * settles, and `result` carries the terminal RunResult.
   */
  class FakeExecutionSession {
    readonly jobId: string;
    readonly result: Promise<RunResult>;
    private readonly queue: ProcessingMessage[] = [];
    private readonly record: (typeof sessionInstances)[number];
    private waiter: (() => void) | null = null;
    private closed = false;

    constructor(options: CreateOptions) {
      this.jobId = `job-${sessionInstances.length + 1}`;
      this.record = { jobId: this.jobId, options, cancelCount: 0 };
      sessionInstances.push(this.record);

      const unsubscribe = options.context.addMessageListener((message) => {
        this.queue.push(message);
        this.wake();
      });
      this.result = runBehavior(
        options.context,
        options.params,
        options.graph
      ).finally(() => {
        this.closed = true;
        unsubscribe();
        this.wake();
      });
      // The real facade always keeps a handler on its result promise.
      this.result.catch(() => undefined);
    }

    private wake(): void {
      const w = this.waiter;
      this.waiter = null;
      w?.();
    }

    get messages(): AsyncIterable<ProcessingMessage> {
      const self = this;
      return {
        async *[Symbol.asyncIterator]() {
          for (;;) {
            while (self.queue.length > 0) {
              yield self.queue.shift()!;
            }
            if (self.closed) return;
            await new Promise<void>((resolve) => {
              self.waiter = resolve;
            });
          }
        }
      };
    }

    cancel(): void {
      this.record.cancelCount += 1;
    }
  }

  return {
    toRawGraphInput: (graph: unknown) => graph,
    ExecutionSession: {
      create: async (options: CreateOptions) =>
        new FakeExecutionSession(options)
    }
  };
});

// Import AFTER mocks are registered.
const { executeAgentGraph } = await import("../src/execute-agent-graph.js");

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

const msg = (
  type: string,
  extra: Record<string, unknown> = {}
): ProcessingMessage => ({ type, ...extra }) as unknown as ProcessingMessage;

/** Lets a started generator get past the async `ExecutionSession.create`. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  sessionInstances.length = 0;
  runBehavior = async () => ({ status: "completed", outputs: {} });
});

describe("executeAgentGraph — happy path", () => {
  it("streams run messages live, then a final step_result", async () => {
    runBehavior = async (ctx) => {
      ctx.emit(msg("log_update", { content: "a" }));
      ctx.emit(msg("node_update", { status: "running" }));
      return { status: "completed", outputs: { answer: 42 } };
    };
    const opts = makeOpts();

    const messages = await drain(executeAgentGraph(emptyGraph, opts));

    expect(messages.map((m) => m.type)).toEqual([
      "log_update",
      "node_update",
      "step_result"
    ]);
    const final = messages[2] as any;
    expect(final.is_task_result).toBe(true);
    expect(final.result).toEqual({ answer: 42 });
    expect(final.step).toMatchObject({
      name: "graph_execution",
      status: "completed"
    });
  });

  it("does not yield a final step_result when there are no outputs", async () => {
    runBehavior = async () => ({ status: "completed", outputs: {} });
    const opts = makeOpts();

    const messages = await drain(executeAgentGraph(emptyGraph, opts));

    expect(messages).toEqual([]);
  });

  it("hands the graph, registry and inputs to the session", async () => {
    const inputs = { topic: "cats" };
    const opts = makeOpts({ inputs });

    await drain(executeAgentGraph(emptyGraph, opts));

    const { options } = sessionInstances[0];
    expect(options.graph).toMatchObject({ nodes: [], edges: [] });
    expect(options.registry).toBe(opts.registry);
    expect(options.params).toBe(inputs);
    // Without capture the session queues nothing and this generator is empty.
    expect(options.captureMessages).toBe(true);
  });

  it("stops forwarding to the caller's context once the run is over", async () => {
    const opts = makeOpts();

    await drain(executeAgentGraph(emptyGraph, opts));

    const runContext = sessionInstances[0].options.context;
    opts.context.emit.mockClear();
    runContext.emit(msg("log_update", { content: "post-run" }));

    expect(opts.context.emit).not.toHaveBeenCalled();
  });
});

describe("executeAgentGraph — run context", () => {
  it("forwards every run message to the caller's context", async () => {
    runBehavior = async (ctx) => {
      ctx.emit(msg("log_update", { content: "a" }));
      return { status: "completed", outputs: {} };
    };
    const opts = makeOpts();

    await drain(executeAgentGraph(emptyGraph, opts));

    expect(opts.context.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "log_update", content: "a" })
    );
  });

  it("injects the run's tools into a scoped child context, not the caller's", async () => {
    const opts = makeOpts();
    await drain(executeAgentGraph(emptyGraph, opts));

    // The run happens against the child, which carries the tools…
    const runContext = sessionInstances[0].options.context as any;
    expect(runContext.setInjectedTools).toHaveBeenCalledWith(opts.tools);
    expect(runContext.getInjectedTool("t1")).toEqual({ name: "t1" });
    // …while the caller's context is left exactly as it was, so a second
    // concurrent run cannot clobber it.
    expect(opts.context.setInjectedTools).not.toHaveBeenCalled();
    expect(opts.context.getInjectedTool("t1")).toBeNull();
  });

  it("shares agent memory with the caller's context", async () => {
    const opts = makeOpts();
    await drain(executeAgentGraph(emptyGraph, opts));

    const runContext = sessionInstances[0].options.context as any;
    expect(runContext.memory).toBe(opts.context.memory);
  });
});

describe("executeAgentGraph — cancellation", () => {
  it("cancels the run when the external signal aborts mid-run", async () => {
    const controller = new AbortController();
    let release: () => void = () => {};
    runBehavior = async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return { status: "completed", outputs: {} };
    };

    const gen = executeAgentGraph(
      emptyGraph,
      makeOpts({ signal: controller.signal })
    );
    const drained = drain(gen);
    await settle();

    controller.abort();
    expect(sessionInstances[0].cancelCount).toBe(1);

    release();
    await drained;
  });

  it("cancels immediately when handed an already-aborted signal", async () => {
    await drain(
      executeAgentGraph(emptyGraph, makeOpts({ signal: AbortSignal.abort() }))
    );

    expect(sessionInstances[0].cancelCount).toBe(1);
  });

  it("detaches the abort listener once the run is over", async () => {
    const controller = new AbortController();
    await drain(
      executeAgentGraph(emptyGraph, makeOpts({ signal: controller.signal }))
    );

    controller.abort();
    // The run already finished; a late abort must not re-enter cancel().
    expect(sessionInstances[0].cancelCount).toBe(0);
  });

  it("cancels the run when the consumer stops reading early", async () => {
    let release: () => void = () => {};
    runBehavior = async (ctx) => {
      ctx.emit(msg("log_update", { content: "a" }));
      await new Promise<void>((r) => {
        release = r;
      });
      return { status: "completed", outputs: {} };
    };

    const gen = executeAgentGraph(emptyGraph, makeOpts());
    await gen.next();
    await gen.return(undefined as never);

    expect(sessionInstances[0].cancelCount).toBe(1);
    release();
  });
});

describe("executeAgentGraph — model stamping", () => {
  const graphWith = (properties: Record<string, unknown>) =>
    ({
      nodes: [{ id: "a1", type: "nodetool.agents.Agent", properties }],
      edges: []
    }) as any;

  const stampedNodes = () => sessionInstances[0].options.graph as any;

  it("stamps the configured provider+model onto a model-less Agent node", async () => {
    await drain(executeAgentGraph(graphWith({ prompt: "hi" }), makeOpts()));

    expect(stampedNodes().nodes[0].properties).toMatchObject({
      prompt: "hi",
      model: { type: "language_model", provider: "mock", id: "mock-model" }
    });
  });

  it("stamps over the empty-model default", async () => {
    await drain(
      executeAgentGraph(
        graphWith({
          model: { type: "language_model", provider: "empty", id: "" }
        }),
        makeOpts()
      )
    );

    expect(stampedNodes().nodes[0].properties.model).toMatchObject({
      provider: "mock",
      id: "mock-model"
    });
  });

  it("leaves a node that already names a model alone", async () => {
    await drain(
      executeAgentGraph(
        graphWith({ model: { provider: "openai", id: "gpt-5.4-mini" } }),
        makeOpts()
      )
    );

    expect(stampedNodes().nodes[0].properties.model).toEqual({
      provider: "openai",
      id: "gpt-5.4-mini"
    });
  });

  it("stamps the run's system prompt and turn budget", async () => {
    await drain(
      executeAgentGraph(
        graphWith({ prompt: "hi" }),
        makeOpts({ systemPrompt: "be terse", maxStepIterations: 5 })
      )
    );

    expect(stampedNodes().nodes[0].properties).toMatchObject({
      system: "be terse",
      max_turns: 5
    });
  });

  it("leaves a node's own system prompt and turn budget alone", async () => {
    await drain(
      executeAgentGraph(
        graphWith({ prompt: "hi", system: "own", max_turns: 3 }),
        makeOpts({ systemPrompt: "be terse", maxStepIterations: 5 })
      )
    );

    expect(stampedNodes().nodes[0].properties).toMatchObject({
      system: "own",
      max_turns: 3
    });
  });

  it("omits policy properties the run did not configure", async () => {
    await drain(executeAgentGraph(graphWith({ prompt: "hi" }), makeOpts()));

    const properties = stampedNodes().nodes[0].properties;
    expect(properties.system).toBeUndefined();
    expect(properties.max_turns).toBeUndefined();
  });

  it("does not touch non-Agent nodes", async () => {
    const graph = {
      nodes: [
        { id: "c1", type: "nodetool.text.Concat", properties: { a: "x" } }
      ],
      edges: []
    } as any;
    await drain(executeAgentGraph(graph, makeOpts()));

    expect(stampedNodes().nodes[0].properties).toEqual({ a: "x" });
  });
});

describe("executeAgentGraph — error propagation", () => {
  it("re-throws an Error rejected by the run", async () => {
    runBehavior = async () => {
      throw new Error("kernel exploded");
    };
    const opts = makeOpts();

    await expect(drain(executeAgentGraph(emptyGraph, opts))).rejects.toThrow(
      "kernel exploded"
    );
  });

  it("still yields buffered messages before throwing on run rejection", async () => {
    runBehavior = async (ctx) => {
      ctx.emit(msg("log_update", { content: "before crash" }));
      throw new Error("boom");
    };
    const opts = makeOpts();
    const gen = executeAgentGraph(emptyGraph, opts);

    const first = await gen.next();
    expect((first.value as any).type).toBe("log_update");
    await expect(gen.next()).rejects.toThrow("boom");
  });

  it("throws the result.error when status is failed", async () => {
    runBehavior = async () => ({
      status: "failed",
      outputs: {},
      error: "node blew up"
    });
    const opts = makeOpts();

    await expect(drain(executeAgentGraph(emptyGraph, opts))).rejects.toThrow(
      "node blew up"
    );
  });

  it("throws a generic message when a failed result has no error string", async () => {
    runBehavior = async () => ({ status: "failed", outputs: {} });
    const opts = makeOpts();

    await expect(drain(executeAgentGraph(emptyGraph, opts))).rejects.toThrow(
      "Workflow execution failed"
    );
  });

  it("stops forwarding to the caller's context even when the run rejects", async () => {
    const opts = makeOpts();
    runBehavior = async () => {
      throw new Error("boom");
    };

    await expect(drain(executeAgentGraph(emptyGraph, opts))).rejects.toThrow(
      "boom"
    );

    const runContext = sessionInstances[0].options.context;
    opts.context.emit.mockClear();
    runContext.emit(msg("log_update", { content: "post-crash" }));

    expect(opts.context.emit).not.toHaveBeenCalled();
  });
});

describe("executeAgentGraph — node error logging", () => {
  it("completes and still yields the final step_result when node_update errors are present", async () => {
    runBehavior = async () => ({
      status: "completed",
      outputs: { ok: true },
      messages: [
        msg("node_update", { status: "error", error: "partial failure" }),
        msg("node_update", { status: "completed" })
      ]
    });
    const opts = makeOpts();

    const messages = await drain(executeAgentGraph(emptyGraph, opts));

    // Node errors are logged, not thrown; the final step_result is still emitted.
    expect(messages).toHaveLength(1);
    expect((messages[0] as any).type).toBe("step_result");
    expect((messages[0] as any).result).toEqual({ ok: true });
  });

  it("tolerates a completed result with a missing messages array", async () => {
    runBehavior = async () => ({ status: "completed", outputs: { a: 1 } });
    const opts = makeOpts();

    const messages = await drain(executeAgentGraph(emptyGraph, opts));

    expect((messages[0] as any).result).toEqual({ a: 1 });
  });
});
