/**
 * Behavioural contracts of WorkflowRunner that were previously unpinned.
 *
 * Each test fixes ONE externally observable guarantee:
 *  - variable-channel lifecycle (register / mark-done / close-all)
 *  - sendControlEvent rejection paths and pending-response rejection
 *  - updateNodeProperties return contract
 *  - validation_issues on the failure job_update
 *  - workflow_id propagation into terminal job_updates
 *  - input-node process() failure wrapping
 *  - retained-message cap
 *  - sink output collection
 *  - client-facing output names
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner, type NodeValidator } from "../src/runner.js";
import type {
  NodeDescriptor,
  Edge,
  JobUpdate,
  OutputUpdate,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeExecutor } from "../src/actor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SET_VARIABLE = "nodetool.variable.SetVariable";

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

function makeRunner(
  executorMap: Record<string, NodeExecutor> = {},
  executionContext?: ProcessingContext,
  validateNode?: NodeValidator
): WorkflowRunner {
  return new WorkflowRunner("mut-job", {
    resolveExecutor: (node) =>
      executorMap[node.id] ??
      executorMap[node.type] ??
      simpleExecutor(() => ({})),
    executionContext,
    validateNode
  });
}

interface ChannelSpy {
  registered: Array<[string, number]>;
  done: string[];
  closedAll: number;
  emitted: ProcessingMessage[];
  context: ProcessingContext;
}

/** Execution context that records the variable-channel calls it receives. */
function makeChannelSpy(): ChannelSpy {
  const spy: ChannelSpy = {
    registered: [],
    done: [],
    closedAll: 0,
    emitted: [],
    context: undefined as unknown as ProcessingContext
  };
  spy.context = {
    emit(msg: ProcessingMessage) {
      spy.emitted.push(msg);
    },
    registerChannelWriters(name: string, count: number) {
      spy.registered.push([name, count]);
    },
    markChannelWriterDone(name: string) {
      spy.done.push(name);
    },
    closeAllChannels() {
      spy.closedAll += 1;
    }
  } as unknown as ProcessingContext;
  return spy;
}

function jobUpdates(messages: ProcessingMessage[]): JobUpdate[] {
  return messages.filter((m): m is JobUpdate => m.type === "job_update");
}

function outputUpdates(messages: ProcessingMessage[]): OutputUpdate[] {
  return messages.filter((m): m is OutputUpdate => m.type === "output_update");
}

type RunnerInternals = {
  _messages: ProcessingMessage[];
  _emit(msg: ProcessingMessage): void;
};
const internals = (r: WorkflowRunner) => r as unknown as RunnerInternals;

// ---------------------------------------------------------------------------
// R1 – Variable-channel lifecycle
// ---------------------------------------------------------------------------

describe("WorkflowRunner – variable channel registration", () => {
  it("registers exactly one writer per Set Variable node, trimming the name", async () => {
    const spy = makeChannelSpy();
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "sv", type: SET_VARIABLE, properties: { name: "  chan  " } }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "sv",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner({}, spy.context).run(
      { job_id: "j-reg", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(spy.registered).toEqual([["chan", 1]]);
  });

  it("skips Set Variable nodes without a usable channel name, and non-Set-Variable nodes", async () => {
    const spy = makeChannelSpy();
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      // blank after trim
      { id: "blank", type: SET_VARIABLE, properties: { name: "   " } },
      // no properties at all
      { id: "bare", type: SET_VARIABLE },
      // name present but not a string
      { id: "numeric", type: SET_VARIABLE, properties: { name: 42 } },
      // properties is not an object — must not be read as a property bag
      {
        id: "fnprops",
        type: SET_VARIABLE,
        properties: function namedChannel() {} as unknown as Record<
          string,
          unknown
        >
      },
      // a different node type that happens to carry a name property
      { id: "other", type: "test.Sink", properties: { name: "not-a-channel" } }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "blank",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "bare",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "numeric",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "fnprops",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "other",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner({}, spy.context).run(
      { job_id: "j-skip", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(spy.registered).toEqual([]);
  });

  it("marks the writer done for the finished Set Variable node only, then closes all channels", async () => {
    const spy = makeChannelSpy();
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "sv", type: SET_VARIABLE, properties: { name: "chan" } },
      // a Set Variable with no channel name must not report a writer done
      { id: "svblank", type: SET_VARIABLE, properties: { name: "" } },
      // a non-Set-Variable actor with a name property must not touch channels
      { id: "other", type: "test.Sink", properties: { name: "othername" } }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "sv",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "svblank",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "other",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner({}, spy.context).run(
      { job_id: "j-done", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(spy.done).toEqual(["chan"]);
    expect(spy.closedAll).toBe(1);
  });

  it("runs a Set Variable graph when the execution context has no channel API", async () => {
    const emitted: ProcessingMessage[] = [];
    const ctx = {
      emit(msg: ProcessingMessage) {
        emitted.push(msg);
      }
    } as unknown as ProcessingContext;
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "sv", type: SET_VARIABLE, properties: { name: "chan" } }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "sv",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner({}, ctx).run(
      { job_id: "j-noapi", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
  });

  it("runs a Set Variable graph with no execution context at all", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "sv", type: SET_VARIABLE, properties: { name: "chan" } }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "sv",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner().run(
      { job_id: "j-noctx", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// R2 – Control-event rejection paths
// ---------------------------------------------------------------------------

describe("WorkflowRunner – sendControlEvent rejections", () => {
  it("names the missing target node in the rejection", async () => {
    const runner = makeRunner();

    await expect(runner.sendControlEvent("ghost", { x: 1 })).rejects.toThrow(
      "Target node not found or no inbox: ghost"
    );
  });

  it("rejects a pending response with the controlled node's own error, then reports it completed", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "ctrl",
        type: "test.Controller",
        is_streaming_output: true,
        outputs: { __control__: "control" }
      },
      {
        id: "worker",
        type: "test.Worker",
        is_controlled: true,
        outputs: { result: "int" }
      }
    ];
    const edges: Edge[] = [
      {
        id: "ce1",
        source: "ctrl",
        sourceHandle: "__control__",
        target: "worker",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];

    let started!: () => void;
    const ctrlStarted = new Promise<void>((r) => {
      started = r;
    });
    const stop = { requested: false };

    const runner = new WorkflowRunner("job-reject", {
      resolveExecutor: (node) => {
        if (node.id === "ctrl") {
          return {
            async *genProcess() {
              started();
              yield { __control__: { event_type: "run", properties: {} } };
              while (!stop.requested) {
                await new Promise((r) => setTimeout(r, 10));
              }
              yield { __control__: { event_type: "stop" } };
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        return {
          process: async (inputs: Record<string, unknown>) => {
            // The controller's own kickoff event carries no `x`; only the
            // test's sendControlEvent does, and that one kills the actor.
            if (inputs.x !== undefined) throw new Error("worker exploded");
            return { result: 0 };
          }
        };
      }
    });

    const runPromise = runner.run({ job_id: "job-reject" }, { nodes, edges });
    await ctrlStarted;
    await new Promise((r) => setTimeout(r, 50));

    // The worker throws → its pending control response carries that message.
    await expect(runner.sendControlEvent("worker", { x: 1 })).rejects.toThrow(
      "worker exploded"
    );

    // A later send to the now-terminated worker is refused up front.
    await expect(runner.sendControlEvent("worker", { x: 2 })).rejects.toThrow(
      "Target node already completed and cannot handle control events: worker"
    );

    stop.requested = true;
    await runPromise;
  }, 10000);
});

// ---------------------------------------------------------------------------
// R3 – updateNodeProperties
// ---------------------------------------------------------------------------

describe("WorkflowRunner – updateNodeProperties", () => {
  it("forwards properties to a live executor that supports them and reports true", async () => {
    const applied: Array<Record<string, unknown>> = [];
    let seen = false;
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "live", type: "test.Live" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "live",
        targetHandle: "value"
      }
    ];

    const runner = new WorkflowRunner("job-props", {
      resolveExecutor: (node) => {
        if (node.id !== "live") return simpleExecutor(() => ({}));
        return {
          applyProperties(props: Record<string, unknown>) {
            applied.push(props);
          },
          async process() {
            // Give the test a window in which the executor is registered.
            while (!seen) await new Promise((r) => setTimeout(r, 5));
            return {};
          }
        } as unknown as NodeExecutor;
      }
    });

    const runPromise = runner.run(
      { job_id: "job-props", params: { x: 1 } },
      { nodes, edges }
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(runner.updateNodeProperties("live", { gain: 0.5 })).toBe(true);
    expect(applied).toEqual([{ gain: 0.5 }]);

    seen = true;
    await runPromise;
  }, 10000);

  it("reports false for an unknown node and for an executor without live updates", async () => {
    const runner = makeRunner();

    // No run has happened — no executors are registered at all.
    expect(runner.updateNodeProperties("nope", { gain: 1 })).toBe(false);

    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "plain", type: "test.Plain" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "plain",
        targetHandle: "value"
      }
    ];
    await runner.run(
      { job_id: "job-noprops", params: { x: 1 } },
      { nodes, edges }
    );

    // The executor exists but has no applyProperties hook.
    expect(runner.updateNodeProperties("plain", { gain: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R4 – validation_issues on the failure job_update
// ---------------------------------------------------------------------------

describe("WorkflowRunner – failure job_update validation_issues", () => {
  it("carries one structured issue per validated node", async () => {
    const validator: NodeValidator = (node) =>
      node.type === "test.NeedsModel"
        ? [{ property: "model", message: 'Property "model" requires a model' }]
        : [];
    const runner = makeRunner({}, undefined, validator);

    const nodes: NodeDescriptor[] = [
      { id: "n1", type: "test.NeedsModel", name: "needs", properties: {} }
    ];
    const result = await runner.run(
      { job_id: "j-vi", workflow_id: "wf-vi" },
      { nodes, edges: [] }
    );

    expect(result.status).toBe("failed");
    const failed = jobUpdates(result.messages as ProcessingMessage[]).find(
      (m) => m.status === "failed"
    );
    expect(failed).toBeDefined();
    expect(failed?.workflow_id).toBe("wf-vi");
    expect(
      (failed as unknown as { validation_issues?: unknown }).validation_issues
    ).toEqual([
      {
        node_id: "n1",
        node_type: "test.NeedsModel",
        property: "model",
        message: 'Property "model" requires a model'
      }
    ]);
  });

  it("reports null validation_issues for a graph error that carries no issues", async () => {
    const runner = makeRunner();

    // An edge type mismatch aborts the run with an issue-less
    // GraphValidationError.
    const nodes: NodeDescriptor[] = [
      { id: "src", type: "test.Src", outputs: { out: "str" } },
      { id: "dst", type: "test.Dst", propertyTypes: { value: "int" } }
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "out",
        target: "dst",
        targetHandle: "value"
      }
    ];
    const result = await runner.run({ job_id: "j-noissues" }, { nodes, edges });

    expect(result.status).toBe("failed");
    const failed = jobUpdates(result.messages as ProcessingMessage[]).find(
      (m) => m.status === "failed"
    );
    expect(
      (failed as unknown as { validation_issues?: unknown }).validation_issues
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R5 – workflow_id on terminal job_updates
// ---------------------------------------------------------------------------

describe("WorkflowRunner – terminal job_update carries workflow_id", () => {
  it("keeps workflow_id on the failed update produced by a node error", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "boom", type: "test.Boom" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "boom",
        targetHandle: "value"
      }
    ];
    const runner = makeRunner({
      boom: {
        async process() {
          throw new Error("node blew up");
        }
      }
    });

    const result = await runner.run(
      { job_id: "j-nodefail", workflow_id: "wf-nodefail", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("failed");
    const failed = jobUpdates(result.messages as ProcessingMessage[]).find(
      (m) => m.status === "failed"
    );
    expect(failed?.workflow_id).toBe("wf-nodefail");
    expect(failed?.error).toContain("node blew up");
  });

  it("keeps workflow_id on the completed update", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "sink", type: "test.Sink" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner().run(
      { job_id: "j-ok", workflow_id: "wf-ok", params: { x: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    const done = jobUpdates(result.messages as ProcessingMessage[]).find(
      (m) => m.status === "completed"
    );
    expect(done?.workflow_id).toBe("wf-ok");
  });
});

// ---------------------------------------------------------------------------
// R6 – input node process() failure
// ---------------------------------------------------------------------------

describe("WorkflowRunner – input node process() failure", () => {
  it("fails the run naming the input node's name and type", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in_id", type: "test.Input", name: "prompt" },
      { id: "sink", type: "test.Sink" }
    ];
    const edges: Edge[] = [
      {
        source: "in_id",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];
    const runner = makeRunner({
      in_id: {
        async process() {
          throw new Error("bad input");
        }
      }
    });

    const result = await runner.run(
      { job_id: "j-inputfail", params: { prompt: "hi" } },
      { nodes, edges }
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe(
      'Input node "prompt" (test.Input) failed: bad input'
    );
  });
});

// ---------------------------------------------------------------------------
// R8 – retained-message cap
// ---------------------------------------------------------------------------

describe("WorkflowRunner – retained message cap", () => {
  it("drops the oldest half once the cap is reached", () => {
    const runner = makeRunner();
    const cap = 10_000;
    const inner = internals(runner);
    inner._messages = Array.from(
      { length: cap },
      (_, i) =>
        ({
          type: "job_update",
          status: "running",
          job_id: `m${i}`
        }) as unknown as ProcessingMessage
    );

    inner._emit({
      type: "job_update",
      status: "running",
      job_id: "fresh"
    } as unknown as ProcessingMessage);

    expect(inner._messages).toHaveLength(cap / 2 + 1);
    expect((inner._messages[0] as JobUpdate).job_id).toBe(`m${cap / 2}`);
    expect(
      (inner._messages[inner._messages.length - 1] as JobUpdate).job_id
    ).toBe("fresh");
  });
});

// ---------------------------------------------------------------------------
// R9 – sink output collection
// ---------------------------------------------------------------------------

describe("WorkflowRunner – output collection", () => {
  it("merges two sinks sharing a name and ignores intermediate nodes", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "mid", type: "test.Mid" },
      { id: "s1", type: "test.Sink", name: "res" },
      { id: "s2", type: "test.Sink", name: "res" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "mid",
        targetHandle: "value"
      },
      {
        source: "mid",
        sourceHandle: "out",
        target: "s1",
        targetHandle: "value"
      },
      {
        source: "mid",
        sourceHandle: "out",
        target: "s2",
        targetHandle: "value"
      }
    ];

    const result = await makeRunner({
      mid: simpleExecutor((inputs) => ({ out: inputs.value })),
      s1: simpleExecutor((inputs) => ({ value: `a:${String(inputs.value)}` })),
      s2: simpleExecutor((inputs) => ({ value: `b:${String(inputs.value)}` }))
    }).run({ job_id: "j-outs", params: { x: 7 } }, { nodes, edges });

    expect(result.status).toBe("completed");
    expect(Object.keys(result.outputs)).toEqual(["res"]);
    expect([...(result.outputs.res as string[])].sort()).toEqual([
      "a:7",
      "b:7"
    ]);
  });
});

// ---------------------------------------------------------------------------
// R10 – client-facing output names
// ---------------------------------------------------------------------------

describe("WorkflowRunner – output_update naming", () => {
  async function namesFor(sink: NodeDescriptor): Promise<string[]> {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      sink
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: sink.id,
        targetHandle: "value"
      }
    ];
    const result = await makeRunner({
      [sink.id]: simpleExecutor((inputs) => ({ output: inputs.value }))
    }).run({ job_id: "j-name", params: { x: 1 } }, { nodes, edges });
    expect(result.status).toBe("completed");
    return outputUpdates(result.messages as ProcessingMessage[])
      .filter((m) => m.node_id === sink.id)
      .map((m) => m.output_name);
  }

  it("uses the trimmed properties.name for Output sinks (exact and suffix type)", async () => {
    await expect(
      namesFor({
        id: "o1",
        type: "nodetool.output.Output",
        properties: { name: "  pin  " }
      })
    ).resolves.toEqual(["pin"]);

    await expect(
      namesFor({
        id: "o2",
        type: "custom.output.Output",
        properties: { name: "pin2" }
      })
    ).resolves.toEqual(["pin2"]);
  });

  it("uses the trimmed properties.name for Preview sinks (exact and suffix type)", async () => {
    await expect(
      namesFor({
        id: "p1",
        type: "nodetool.workflows.base_node.Preview",
        properties: { name: "shown" }
      })
    ).resolves.toEqual(["shown"]);

    await expect(
      namesFor({
        id: "p2",
        type: "custom.workflows.base_node.Preview",
        properties: { name: "shown2" }
      })
    ).resolves.toEqual(["shown2"]);
  });

  it("falls back to the handle for a blank name and for non-sink node types", async () => {
    await expect(
      namesFor({
        id: "o3",
        type: "nodetool.output.Output",
        properties: { name: "   " }
      })
    ).resolves.toEqual(["output"]);

    await expect(
      namesFor({
        id: "s3",
        type: "test.Sink",
        properties: { name: "ignored" }
      })
    ).resolves.toEqual(["output"]);
  });
});
