/**
 * `nodetool run` once reported "completed" for a Comfy graph with no job
 * submitted, because this load path did not collapse the graph into its runner.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import { COMFY_CLOUD_GRAPH_NODE_TYPE } from "@nodetool-ai/protocol";
import { initTestDb } from "@nodetool-ai/models";
import { ExecutionSession } from "../src/index.js";

let runnerCalls = 0;

class FakeComfyRunner extends BaseNode {
  static readonly nodeType = COMFY_CLOUD_GRAPH_NODE_TYPE;
  static readonly title = "Fake Comfy Runner";
  static readonly description = "Counts the runs that reach the Comfy runner";

  async process(): Promise<Record<string, unknown>> {
    runnerCalls += 1;
    return {};
  }
}

describe("ExecutionSession Comfy graph", () => {
  beforeEach(() => {
    initTestDb();
    runnerCalls = 0;
  });

  it("collapses a Comfy graph so that the run reaches the runner", async () => {
    const registry = new NodeRegistry();
    registry.register(FakeComfyRunner);
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "1", type: "comfy.EmptyImage", data: {} }],
        edges: []
      },
      registry,
      bridgeFactory: async () => null,
      workflowId: "wf-comfy"
    });

    expect((await session.result).status).toBe("completed");
    expect(runnerCalls).toBe(1);
  });
});
