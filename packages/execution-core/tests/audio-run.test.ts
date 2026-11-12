import { describe, expect, it } from "vitest";
import { AUDIO_RUN_KEY, type NodeDescriptor } from "@nodetool-ai/protocol";
import { Graph } from "../src/graph.js";
import { WorkflowRunner } from "../src/runner.js";

it("resolves the transport before any node starts and resets it for a reused context", async () => {
  const values = new Map<string, unknown>();
  const context = {
    emit() {},
    set(key: string, value: unknown) {
      values.set(key, value);
    }
  };
  const calls: unknown[] = [];
  const execute = async (nodes: NodeDescriptor[]): Promise<void> => {
    const runner = new WorkflowRunner("audio", {
      executionContext: context,
      resolveExecutor: () => ({
        async process() {
          calls.push(values.get(AUDIO_RUN_KEY));
          return { output: 1 };
        }
      })
    });
    const result = await runner.run({ job_id: "audio" }, { nodes, edges: [] });
    expect(result.status).toBe("completed");
  };
  await execute([
    {
      id: "recorder",
      type: "test.Recorder",
      audio_sink: "render",
      properties: { duration: 2 },
      outputs: { output: "any" }
    }
  ]);
  await execute([
    {
      id: "monitor",
      type: "test.Monitor",
      audio_sink: "live",
      outputs: { output: "any" }
    }
  ]);
  await execute([
    { id: "ordinary", type: "test.Ordinary", outputs: { output: "any" } }
  ]);
  expect(calls).toEqual([
    { mode: "render", endFrame: 88200 },
    { mode: "live", endFrame: null },
    { mode: "free", endFrame: null }
  ]);
});

describe("hosts without a variable store", () => {
  it("keeps ordinary lean runners usable", async () => {
    const runner = new WorkflowRunner("lean", {
      executionContext: { emit() {} },
      resolveExecutor: () => ({
        async process() {
          return { output: 1 };
        }
      })
    });
    expect(
      (
        await runner.run(
          { job_id: "lean" },
          {
            nodes: [{ id: "n", type: "test.Node", outputs: { output: "any" } }],
            edges: []
          }
        )
      ).status
    ).toBe("completed");
  });
});


it("ignores bypassed live sinks when resolving a bounded render", async () => {
  const values = new Map<string, unknown>();
  const seen: unknown[] = [];
  const runner = new WorkflowRunner("bypassed-audio", {
    executionContext: { emit() {}, set(key: string, value: unknown) { values.set(key, value); } },
    resolveExecutor: () => ({ async process() { seen.push(values.get(AUDIO_RUN_KEY)); return {}; } })
  });
  const result = await runner.run({ job_id: "bypassed-audio" }, {
    nodes: [
      { id: "recorder", type: "test.Recorder", audio_sink: "render", properties: { duration: 2 } },
      { id: "monitor", type: "test.Monitor", audio_sink: "live", ui_properties: { bypassed: true } }
    ], edges: []
  });
  expect(result.status).toBe("completed");
  expect(seen).toEqual([{ mode: "render", endFrame: 88200 }]);
});

it("Graph.loadFromDict drops a stale audio sink from an ordinary registered node", async () => {
  const graph = await Graph.loadFromDict({ nodes: [{ id: "ordinary", type: "test.Ordinary", audio_sink: "live" }], edges: [] }, {
    resolver: { async resolveNodeType(type) { return { nodeType: type, descriptorDefaults: { audio_sink: undefined }, propertyTypes: {}, outputs: {} }; } }
  });
  expect(graph.nodes[0].audio_sink).toBeUndefined();
});
