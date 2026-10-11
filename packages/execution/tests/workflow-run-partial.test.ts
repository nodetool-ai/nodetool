/**
 * `runWorkflow` with `nodeIds` (issue #6240): the REST `node_ids` field and
 * the `run_workflow` / `debug_workflow` / `start_background_job` MCP argument.
 *
 * The run executes the selection and what it needs upstream. An upstream
 * generator with a saved generation is fed that output instead of running, so
 * it is not billed twice. A saved-workflow run hands each generation to the
 * host's `persistGeneration`, which is what a later partial run reads back.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  prop,
  type GraphInput
} from "@nodetool-ai/node-sdk";
import { type ProcessingContext } from "@nodetool-ai/runtime";
import type { RunGeneration } from "../src/service/workflow-run.js";

// prompt → gen → caption → shout, and gen → sibling.
const graph: GraphInput = {
  nodes: [
    { id: "prompt", type: "test.partial.Text", data: { value: "a cat" } },
    { id: "gen", type: "test.partial.Gen", data: {} },
    { id: "caption", type: "test.partial.Echo", data: {} },
    { id: "shout", type: "test.partial.Echo", data: {} },
    { id: "sibling", type: "test.partial.Echo", data: {} }
  ],
  edges: [
    {
      id: "e1",
      source: "prompt",
      sourceHandle: "output",
      target: "gen",
      targetHandle: "prompt"
    },
    {
      id: "e2",
      source: "gen",
      sourceHandle: "output",
      target: "caption",
      targetHandle: "input"
    },
    {
      id: "e3",
      source: "caption",
      sourceHandle: "output",
      target: "shout",
      targetHandle: "input"
    },
    {
      id: "e4",
      source: "gen",
      sourceHandle: "output",
      target: "sibling",
      targetHandle: "input"
    }
  ]
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

const savedAssets: Array<Record<string, unknown>> = [];
const jobCreate = vi.fn(async (_row: Record<string, unknown>) => new FakeJob());
const assetPaginate = vi.fn(
  async (
    _userId: string,
    opts: { workflowId?: string; nodeId?: string }
  ): Promise<[Array<Record<string, unknown>>, string]> => [
    savedAssets.filter(
      (a) => a["workflow_id"] === opts.workflowId && a["node_id"] === opts.nodeId
    ),
    ""
  ]
);

vi.mock("@nodetool-ai/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workflow: {
      find: vi.fn(async () => ({
        id: "wf-1",
        name: "Partial",
        run_mode: "workflow",
        project_id: null,
        getGraph: () => graph
      }))
    },
    Workspace: { find: vi.fn(async () => null) },
    Job: { create: jobCreate },
    Asset: { paginate: assetPaginate },
    Prediction: { create: vi.fn() },
    getSecret: vi.fn(async () => null)
  };
});

vi.mock("../src/service/run-trace-lifecycle.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/service/run-trace-lifecycle.js")>();
  return {
    ...actual,
    registerWorkflowRunTrace: vi.fn(async () => undefined),
    settleRegisteredRunTrace: vi.fn(async () => undefined),
    withRegisteredRunTrace: vi.fn(async <T>(_context: ProcessingContext, _kind: string, execute: () => Promise<T>): Promise<T> => execute())
  };
});

const { runWorkflow } = await import("../src/service/workflow-run.js");

const calls: string[] = [];

class Text extends BaseNode {
  static readonly nodeType = "test.partial.Text";
  static readonly title = "Text";
  static readonly description = "Emits its value";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "" })
  declare value: string;

  async process(): Promise<Record<string, unknown>> {
    calls.push("prompt");
    return { output: this.value };
  }
}

/** Stands in for a billed provider call. */
class Gen extends BaseNode {
  static readonly nodeType = "test.partial.Gen";
  static readonly title = "Gen";
  static readonly description = "A generator that auto-saves its output";
  static readonly autoSaveAsset = true;
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "" })
  declare prompt: string;

  async process(): Promise<Record<string, unknown>> {
    calls.push("gen");
    return { output: `generated ${this.prompt}` };
  }
}

class Echo extends BaseNode {
  static readonly nodeType = "test.partial.Echo";
  static readonly title = "Echo";
  static readonly description = "Passes its input through";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "" })
  declare input: string;

  async process(): Promise<Record<string, unknown>> {
    calls.push(`echo:${this.input}`);
    return { output: this.input };
  }
}

const persisted: RunGeneration[] = [];

async function run(
  options: Partial<Parameters<typeof runWorkflow>[0]> = {}
): Promise<Awaited<ReturnType<typeof runWorkflow>>> {
  const registry = new NodeRegistry();
  registry.register(Text);
  registry.register(Gen);
  registry.register(Echo);
  return runWorkflow({
    workflowId: "wf-1",
    userId: "user-7",
    environment: {
      registry,
      persistGeneration: async (generation) => {
        persisted.push(generation);
      }
    },
    resolveWorkspace: async () => null,
    ...options
  });
}

function payloadOf(outcome: Awaited<ReturnType<typeof runWorkflow>>) {
  if (outcome.kind !== "payload") {
    throw new Error(`run refused: ${outcome.detail}`);
  }
  return outcome.payload;
}

beforeEach(() => {
  calls.length = 0;
  persisted.length = 0;
  savedAssets.length = 0;
  jobCreate.mockClear();
  assetPaginate.mockClear();
});

describe("runWorkflow with nodeIds", () => {
  it("refuses an unknown node id before the job row exists", async () => {
    const outcome = await run({ nodeIds: ["caption", "typo"] });
    expect(outcome).toEqual({
      kind: "error",
      status: 400,
      detail: "Unknown node ids in node_ids: typo"
    });
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it("runs the selection and its upstream only", async () => {
    const payload = payloadOf(await run({ nodeIds: ["caption"] }));
    expect(payload["status"]).toBe("completed");
    expect(calls.sort()).toEqual(["echo:generated a cat", "gen", "prompt"]);
    expect(payload["partial_run"]).toEqual({
      node_ids: ["caption"],
      ran: ["prompt", "gen", "caption"],
      reused: []
    });
  });

  it("reuses the generator's saved generation instead of running it", async () => {
    savedAssets.push({
      id: "asset-1",
      workflow_id: "wf-1",
      node_id: "gen",
      job_id: "job-0",
      content_type: "text/plain",
      size: Buffer.byteLength("saved cat"),
      metadata: { text: "saved cat", generation_index: 0 }
    });
    const payload = payloadOf(await run({ nodeIds: ["caption"] }));
    expect(payload["status"]).toBe("completed");
    expect(calls).toEqual(["echo:saved cat"]);
    expect(payload["partial_run"]).toEqual({
      node_ids: ["caption"],
      ran: ["caption"],
      reused: [{ node_id: "gen", job_id: "job-0", asset_ids: ["asset-1"] }]
    });
    // The job row records the graph that ran.
    const row = jobCreate.mock.calls[0]![0] as {
      graph: { nodes: Array<{ id: string }> };
    };
    expect(row.graph.nodes.map((n) => n.id)).toEqual(["caption"]);
  });

  it("runs the generator again when reuseResults is false", async () => {
    savedAssets.push({
      id: "asset-1",
      workflow_id: "wf-1",
      node_id: "gen",
      job_id: "job-0",
      content_type: "text/plain",
      size: 9,
      metadata: { text: "saved cat" }
    });
    payloadOf(await run({ nodeIds: ["caption"], reuseResults: false }));
    expect(calls).toContain("gen");
    expect(assetPaginate).not.toHaveBeenCalled();
  });

  it("does not reuse for an inline graph run, which has no saved generations", async () => {
    payloadOf(
      await run({ workflowId: "", graph, nodeIds: ["caption"] })
    );
    expect(calls).toContain("gen");
    expect(assetPaginate).not.toHaveBeenCalled();
  });

  it("puts partial_run on a background receipt", async () => {
    const payload = payloadOf(
      await run({ nodeIds: ["caption"], background: true })
    );
    expect(payload["partial_run"]).toMatchObject({ node_ids: ["caption"] });
  });
});

describe("generation saves", () => {
  it("hands each generation of an auto-saving node to the host before the run settles", async () => {
    payloadOf(await run());
    expect(persisted).toEqual([
      {
        userId: "user-7",
        workflowId: "wf-1",
        jobId: "job-1",
        nodeId: "gen",
        nodeType: "test.partial.Gen",
        index: 0,
        outputs: { output: "generated a cat" },
        properties: expect.anything()
      }
    ]);
  });

  it("saves nothing for an inline graph run", async () => {
    payloadOf(await run({ workflowId: "", graph }));
    expect(persisted).toEqual([]);
  });
});
