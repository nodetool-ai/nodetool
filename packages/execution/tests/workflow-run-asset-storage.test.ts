/**
 * An uploaded asset wired into a graph must reach the node that reads it.
 *
 * The service-layer run path (REST `/api/workflows/:id/run|debug`, tRPC, MCP)
 * built its ProcessingContext with no storage adapters at all, so every
 * `asset://<id>` input resolved to nothing: an Image To Image node fed a
 * freshly uploaded photo failed with "The input image is empty". The host now
 * hands the run the same asset store the streaming WebSocket runner uses.
 */

import { describe, expect, it, vi } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  prop,
  type GraphInput
} from "@nodetool-ai/node-sdk";
import {
  InMemoryStorageAdapter,
  type ProcessingContext
} from "@nodetool-ai/runtime";

const graph: GraphInput = {
  nodes: [
    {
      id: "n1",
      type: "test.execution.ReadAsset",
      data: { uri: "asset://abc" }
    }
  ],
  edges: []
};

class FakeJob {
  id = "job-1";
  status = "running";
  error: string | null = null;
  logs: unknown[] = [];
  metadata_json: Record<string, unknown> | null = null;
  markCompleted(): void {
    this.status = "completed";
  }
  markCancelled(): void {
    this.status = "cancelled";
  }
  markFailed(message: string): void {
    this.status = "failed";
    this.error = message;
  }
  async save(): Promise<void> {}
}

vi.mock("@nodetool-ai/models", () => ({
  Workflow: {
    find: vi.fn(async () => ({
      id: "wf-1",
      name: "Read Asset",
      run_mode: "workflow",
      getGraph: () => graph
    }))
  },
  Workspace: { find: vi.fn(async () => null) },
  Job: { create: vi.fn(async () => new FakeJob()) },
  Prediction: { create: vi.fn() },
  getSecret: vi.fn(async () => null)
}));

const { runWorkflow } = await import("../src/service/workflow-run.js");

/** Reports how many bytes its `uri` resolved to — 0 when it resolved none. */
class ReadAsset extends BaseNode {
  static readonly nodeType = "test.execution.ReadAsset";
  static readonly title = "Read Asset";
  static readonly description = "Resolves an asset ref to its byte count";

  @prop({ type: "str", default: "" })
  declare uri: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { bytes } = (await context?.resolveAssetBytes(this.uri)) ?? {
      bytes: null
    };
    return { output: bytes?.length ?? 0 };
  }
}

async function runWith(
  assetStorage: InMemoryStorageAdapter | null
): Promise<Record<string, unknown[]>> {
  const registry = new NodeRegistry();
  registry.register(ReadAsset);
  const outcome = await runWorkflow({
    workflowId: "wf-1",
    userId: "user-7",
    environment: { registry, assetStorage },
    resolveWorkspace: async () => null
  });
  if (outcome.kind !== "payload") {
    throw new Error(`run failed: ${outcome.detail}`);
  }
  return outcome.payload.outputs as Record<string, unknown[]>;
}

describe("runWorkflow asset resolution", () => {
  it("reads an uploaded asset through the host's asset store", async () => {
    const assetStorage = new InMemoryStorageAdapter();
    // The layout an upload writes: owner-prefixed, extension on disk, while
    // the graph's ref carries neither.
    await assetStorage.store(
      "user-7/abc.jpeg",
      new Uint8Array([1, 2, 3, 4]),
      "image/jpeg"
    );

    expect((await runWith(assetStorage)).n1).toEqual([4]);
  });

  it("resolves nothing when the host brings no asset store", async () => {
    expect((await runWith(null)).n1).toEqual([0]);
  });
});
