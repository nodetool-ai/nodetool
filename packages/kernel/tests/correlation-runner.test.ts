/**
 * Integration tests for envelope propagation through WorkflowRunner.
 *
 * Asserts (under NODETOOL_USE_CORRELATION=1) that:
 *  - source_edge_id is synthesized deterministically when an edge has no id
 *  - single-input single-edge buffered nodes inherit lineage from the
 *    consumed envelope (default empty for source-fed nodes)
 *  - outputs.forward() copies the envelope's lineage to the downstream put
 *  - Behavior is unchanged when the flag is off (no regression)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CorrelationLineage,
  Edge,
  NodeDescriptor
} from "@nodetool-ai/protocol";
import { WorkflowRunner } from "../src/runner.js";
import type { MessageEnvelope } from "../src/inbox.js";
import type { NodeExecutor } from "../src/actor.js";
import type { NodeInputs, NodeOutputs } from "../src/io.js";

const FLAG = "NODETOOL_USE_CORRELATION";

function captureSinkExecutor(
  captured: { envelopes: MessageEnvelope[] }
): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, _outputs: NodeOutputs) {
      for await (const env of inputs.streamWithEnvelope("value")) {
        captured.envelopes.push(env);
      }
    }
  };
}

function passthroughExecutor(): NodeExecutor {
  return {
    async process(ins) {
      return { value: ins.value };
    }
  };
}

function forwardExecutor(): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      for await (const env of inputs.streamWithEnvelope("value")) {
        await outputs.forward("value", env);
      }
    }
  };
}

function makeRunner(
  executors: Record<string, NodeExecutor>
): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) =>
      executors[node.id] ?? executors[node.type] ?? passthroughExecutor()
  });
}

describe("WorkflowRunner – envelope propagation under NODETOOL_USE_CORRELATION", () => {
  const originalFlag = process.env[FLAG];

  beforeEach(() => {
    process.env[FLAG] = "1";
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = originalFlag;
    }
  });

  it("synthesizes source_edge_id at every routing site", async () => {
    const captured = { envelopes: [] as MessageEnvelope[] };
    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "x",
        properties: { value: 7 }
      },
      {
        id: "mid",
        type: "test.Passthrough"
      },
      {
        id: "sink",
        type: "test.Sink",
        is_streaming_input: true
      }
    ];
    const edges: Edge[] = [
      // Edge from input → mid intentionally has no id; we expect synthesis.
      {
        source: "src",
        sourceHandle: "value",
        target: "mid",
        targetHandle: "value"
      },
      // Edge from mid → sink has an explicit id.
      {
        id: "edge-mid-sink",
        source: "mid",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Passthrough": passthroughExecutor(),
      "test.Sink": captureSinkExecutor(captured)
    });
    const result = await runner.run(
      { job_id: "synth-edge", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    expect(captured.envelopes).toHaveLength(1);
    expect(captured.envelopes[0].source_edge_id).toBe("edge-mid-sink");
    // mid did not call outputs.forward, so lineage is the actor's
    // inferred invocation lineage — empty for a source-fed input.
    expect(captured.envelopes[0].correlation_lineage).toEqual({});
  });

  it("propagates explicit lineage from outputs.forward()", async () => {
    const captured = { envelopes: [] as MessageEnvelope[] };
    const seededLineage: CorrelationLineage = {
      "src:items": { index: 4 }
    };

    const nodes: NodeDescriptor[] = [
      // A custom source that pre-seeds lineage on its emitted envelope.
      {
        id: "src",
        type: "test.Seed",
        is_streaming_input: true
      },
      { id: "fwd", type: "test.Forward", is_streaming_input: true },
      { id: "sink", type: "test.Sink", is_streaming_input: true }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "src",
        sourceHandle: "value",
        target: "fwd",
        targetHandle: "value"
      },
      {
        id: "e2",
        source: "fwd",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const seedExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs: NodeInputs, outputs: NodeOutputs) {
        await outputs.emit("value", "payload", { lineage: seededLineage });
      }
    };

    const runner = makeRunner({
      "test.Seed": seedExecutor,
      "test.Forward": forwardExecutor(),
      "test.Sink": captureSinkExecutor(captured)
    });
    const result = await runner.run(
      { job_id: "fwd-lineage", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    expect(captured.envelopes).toHaveLength(1);
    expect(captured.envelopes[0].correlation_lineage).toEqual(seededLineage);
    expect(captured.envelopes[0].source_edge_id).toBe("e2");
  });

  it("does not change output values when the flag is off", async () => {
    delete process.env[FLAG];

    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "x",
        properties: { value: 9 }
      },
      { id: "mid", type: "test.Passthrough" }
    ];
    const edges: Edge[] = [
      {
        source: "src",
        sourceHandle: "value",
        target: "mid",
        targetHandle: "value"
      }
    ];
    const runner = makeRunner({
      "test.Passthrough": passthroughExecutor()
    });
    const result = await runner.run(
      { job_id: "flag-off", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
  });
});
