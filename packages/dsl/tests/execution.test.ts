import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseNode, NodeRegistry, prop } from "@nodetool-ai/node-sdk";
import {
  WorkflowRunner,
  withExplicitNodeFlags,
  type RunResult
} from "@nodetool-ai/kernel";
import { ProcessingContext, type PythonBridgeBase } from "@nodetool-ai/runtime";
import type { NodeDescriptor, ProcessingMessage } from "@nodetool-ai/protocol";
import { ExecutionSession } from "@nodetool-ai/execution";
import {
  createNode,
  run,
  workflow,
  type Workflow,
  type SingleOutput
} from "../src/core.js";
import {
  buildBuiltinRegistry,
  createExecutorResolver,
  createHasTsExecutor
} from "../src/registry.js";

const connection = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("@nodetool-ai/runtime", async (original) => ({
  ...(await original<typeof import("@nodetool-ai/runtime")>()),
  connectPythonBridgeForGraph: connection.connect
}));

class Echo extends BaseNode {
  static readonly nodeType: string = "test.dsl.Echo";
  static readonly title = "Echo";
  @prop({ type: "str", default: "hello" })
  declare value: string;
  async process(): Promise<Record<string, unknown>> {
    return { output: this.value };
  }
}
class GlobalEcho extends Echo {
  async process(): Promise<Record<string, unknown>> {
    return { output: "global" };
  }
}
class GlobalString extends Echo {
  static readonly nodeType = "nodetool.constant.String";
  async process(): Promise<Record<string, unknown>> {
    return { output: "global builtin override" };
  }
}
class CustomEcho extends Echo {
  async process(): Promise<Record<string, unknown>> {
    return { output: "custom" };
  }
}
class Empty extends BaseNode {
  static readonly nodeType = "test.dsl.Empty";
  static readonly title = "Empty";
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}
class Throws extends BaseNode {
  static readonly nodeType = "test.dsl.Throws";
  static readonly title = "Throws";
  async process(): Promise<Record<string, unknown>> {
    throw new Error("node exploded");
  }
}
class ReportsError extends BaseNode {
  static readonly nodeType = "test.dsl.ReportsError";
  static readonly title = "Reports Error";
  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    context?.emit({
      type: "node_update",
      node_id: "reported",
      node_name: "Reported",
      status: "error",
      error: "reported error"
    });
    return { output: "still completed" };
  }
}

beforeEach(() => {
  connection.connect.mockReset().mockResolvedValue(null);
  NodeRegistry.global.register(GlobalEcho);
});
afterEach(() => vi.restoreAllMocks());

function registry(): NodeRegistry {
  const result = new NodeRegistry();
  for (const node of [Echo, Empty, Throws, ReportsError]) {
    result.register(node);
  }
  return result;
}

/** The previous DSL execution path, retained only as a differential oracle. */
async function previousRun(
  graph: Workflow,
  custom: NodeRegistry
): Promise<RunResult> {
  const nodes: NodeDescriptor[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    properties: node.data,
    is_streaming_input: node.streamingInput,
    is_streaming_output: node.streaming
  }));
  const builtin = await buildBuiltinRegistry();
  const runner = new WorkflowRunner("equivalence", {
    resolveExecutor: createExecutorResolver(
      { registry: custom },
      builtin,
      null
    ),
    executionContext: new ProcessingContext({
      jobId: "equivalence",
      userId: "1"
    })
  });
  return runner.run(
    { job_id: "equivalence" },
    withExplicitNodeFlags({ nodes, edges: [...graph.edges] })
  );
}

function relevant(messages: readonly ProcessingMessage[]): unknown[] {
  // Run identity and node durations differ between executions.
  return messages.map(({ type, ...fields }) => {
    const rest = Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => key !== "job_id" && key !== "duration_ms"
      )
    );
    return { type, ...rest };
  });
}

describe("DSL execution compatibility", () => {
  it("selects caller registry before global, then builtin before Python", async () => {
    const custom = new NodeRegistry();
    custom.register(CustomEcho);
    const a = createNode<SingleOutput<string>>(Echo.nodeType, {});
    expect(await run(workflow(a), { registry: custom })).toEqual({
      [a.nodeId]: "custom"
    });
    const b = createNode<SingleOutput<string>>(Echo.nodeType, {});
    expect(await run(workflow(b))).toEqual({ [b.nodeId]: "global" });
    const c = createNode<SingleOutput<string>>("nodetool.constant.String", {
      value: "builtin"
    });
    // Use a known builtin type from its own registry rather than assuming a generated helper.
    const builtin = await buildBuiltinRegistry();
    expect(builtin.has(c.nodeType)).toBe(true);
    expect(createHasTsExecutor(undefined, builtin)(c.nodeType)).toBe(true);
    expect(await run(workflow(c))).toEqual({ [c.nodeId]: "builtin" });
    const predicate = connection.connect.mock.calls[2][1];
    expect(predicate(c.nodeType)).toBe(true);
    expect(predicate(Echo.nodeType)).toBe(true);
    expect(predicate("python.Test")).toBe(false);
  });

  it("selects a global override before the builtin pack", async () => {
    const previous = NodeRegistry.global.getClass(GlobalString.nodeType);
    NodeRegistry.global.register(GlobalString);
    try {
      const node = createNode<SingleOutput<string>>(GlobalString.nodeType, {});
      expect(await run(workflow(node))).toEqual({
        [node.nodeId]: "global builtin override"
      });
    } finally {
      NodeRegistry.global.unregister(GlobalString.nodeType);
      if (previous) {
        NodeRegistry.global.register(previous);
      }
    }
  });

  it("returns an empty record for a terminal that emits no outputs", async () => {
    const node = createNode<SingleOutput<string>>(Empty.nodeType, {});
    expect(await run(workflow(node), { registry: registry() })).toEqual({});
  });

  it("runs Python resolution with secrets and closes the session-owned bridge", async () => {
    const close = vi.fn();
    const execute = vi
      .fn()
      .mockResolvedValue({ outputs: { output: "python" }, blobs: {} });
    // Only the transport/resolver surface is needed, without starting a subprocess.
    const bridge = {
      close,
      execute,
      hasNodeType: (type: string) => type === "python.Test",
      getNodeMetadata: () => [
        {
          node_type: "python.Test",
          outputs: [{ name: "output", type: { type: "str" } }],
          required_settings: ["TEST_KEY"]
        }
      ],
      jobStart: vi.fn().mockResolvedValue(undefined),
      jobEnd: vi.fn().mockResolvedValue(undefined)
    } as unknown as PythonBridgeBase;
    connection.connect.mockResolvedValue(bridge);
    const node = createNode<SingleOutput<string>>("python.Test", {
      value: "input"
    });
    const secret = vi.fn().mockResolvedValue("secret");
    expect(
      await run(workflow(node), {
        userId: "custom-user",
        secretResolver: secret,
        bridgeOptions: { wsUrl: "ws://worker" }
      })
    ).toEqual({ [node.nodeId]: "python" });
    expect(secret).toHaveBeenCalledWith("TEST_KEY", "custom-user");
    expect(execute.mock.calls[0][2]).toEqual({ TEST_KEY: "secret" });
    expect(connection.connect.mock.calls[0][2]).toEqual({
      wsUrl: "ws://worker"
    });
    expect(close).toHaveBeenCalledTimes(1);
    execute.mockRejectedValueOnce(new Error("Python execution failed"));
    const failing = createNode<SingleOutput<string>>("python.Test", {});
    await expect(run(workflow(failing))).rejects.toThrow(
      "Python execution failed"
    );
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("throws on unknown types and actor failures", async () => {
    const unknown = createNode<SingleOutput<string>>("unknown.Test", {});
    await expect(run(workflow(unknown))).rejects.toThrow(
      "Unknown node type: unknown.Test"
    );
    const failing = createNode<SingleOutput<string>>(Throws.nodeType, {});
    await expect(
      run(workflow(failing), { registry: registry() })
    ).rejects.toThrow("node exploded");
  });

  it("keeps the DSL exception policy for a completed result containing a node error", async () => {
    const node = createNode<SingleOutput<string>>(ReportsError.nodeType, {});
    vi.spyOn(WorkflowRunner.prototype, "run").mockResolvedValue({
      outputs: {},
      status: "completed",
      messages: [
        {
          type: "node_update",
          node_id: node.nodeId,
          node_name: "Reported",
          status: "error",
          error: "reported error"
        }
      ]
    });
    await expect(run(workflow(node), { registry: registry() })).rejects.toThrow(
      "reported error"
    );
  });

  it.each(["outputs", "failure", "empty"])(
    "matches the previous path for %s",
    async (kind) => {
      const first = createNode<SingleOutput<string>>(
        kind === "failure"
          ? Throws.nodeType
          : kind === "empty"
            ? Empty.nodeType
            : Echo.nodeType,
        { value: "first" }
      );
      const second = createNode<SingleOutput<string>>(Echo.nodeType, {
        value: "second"
      });
      const graph = workflow(first, second);
      const expected = await previousRun(graph, registry());
      let actual: RunResult | undefined;
      const create = ExecutionSession.create.bind(ExecutionSession);
      vi.spyOn(ExecutionSession, "create").mockImplementation(
        async (options) => {
          const session = await create(options);
          actual = await session.result;
          return session;
        }
      );
      if (expected.status === "failed") {
        await expect(run(graph, { registry: registry() })).rejects.toThrow(
          expected.error
        );
      } else {
        const outputs = Object.fromEntries(
          Object.entries(expected.outputs)
            .filter(([, values]) => values.length)
            .map(([key, values]) => [key, values.at(-1)])
        );
        expect(await run(graph, { registry: registry() })).toEqual(outputs);
      }
      expect(actual?.outputs).toEqual(expected.outputs);
      expect(actual?.status).toBe(expected.status);
      expect(actual?.error).toBe(expected.error);
      expect(relevant(actual?.messages ?? [])).toEqual(
        relevant(expected.messages)
      );
    }
  );
});
