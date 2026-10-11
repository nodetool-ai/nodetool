/**
 * `POST /api/workflows/:id/run` with `node_ids` (issue #6240), end to end on
 * a real database and asset store: a full run saves the generator's output as
 * an asset, and a later partial run feeds that saved output to the selected
 * node instead of calling the generator (and its provider) again.
 */
import os from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

// Must be set before anything calls getAssetAdapter(): the adapter is module
// state, created once from ASSET_FOLDER on first use.
process.env.ASSET_FOLDER = mkdtempSync(join(os.tmpdir(), "nt-partial-run-"));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, Workflow } from "@nodetool-ai/models";
import { BaseNode, NodeRegistry, prop } from "@nodetool-ai/node-sdk";

vi.mock("../src/lib/workflow-workspace.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/workflow-workspace.js")
  >("../src/lib/workflow-workspace.js");
  return {
    ...actual,
    resolveWorkflowWorkspace: async () => os.tmpdir()
  };
});

const { handleWorkflowRun } = await import("../src/http-api.js");

const calls: string[] = [];

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

const registry = new NodeRegistry();
registry.register(Gen);
registry.register(Echo);

const GRAPH = {
  nodes: [
    { id: "gen", type: "test.partial.Gen", data: { prompt: "a cat" } },
    { id: "caption", type: "test.partial.Echo", data: {} },
    { id: "sibling", type: "test.partial.Echo", data: {} }
  ],
  edges: [
    {
      id: "e1",
      source: "gen",
      sourceHandle: "output",
      target: "caption",
      targetHandle: "input"
    },
    {
      id: "e2",
      source: "gen",
      sourceHandle: "output",
      target: "sibling",
      targetHandle: "input"
    }
  ]
};

function runRequest(body: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "x-user-id": "user-1", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function makeWorkflow(): Promise<Workflow> {
  return (await Workflow.create({
    user_id: "user-1",
    name: "Partial",
    access: "private",
    graph: GRAPH
  })) as Workflow;
}

beforeEach(async () => {
  await initTestDb();
  calls.length = 0;
});

describe("POST /api/workflows/:id/run with node_ids", () => {
  it("reuses the generation a full run saved instead of calling the generator", async () => {
    const wf = await makeWorkflow();

    const full = await handleWorkflowRun(runRequest({}), wf.id, { registry });
    expect(full.status).toBe(200);
    expect(calls.filter((c) => c === "gen")).toHaveLength(1);
    const [saved] = await Asset.paginate("user-1", {
      workflowId: wf.id,
      nodeId: "gen"
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.metadata).toMatchObject({ text: "generated a cat" });

    calls.length = 0;
    const partial = await handleWorkflowRun(
      runRequest({ node_ids: ["caption"] }),
      wf.id,
      { registry }
    );
    expect(partial.status).toBe(200);
    const body = (await partial.json()) as Record<string, unknown>;
    expect(body["status"]).toBe("completed");
    expect(calls).toEqual(["echo:generated a cat"]);
    expect(body["partial_run"]).toEqual({
      node_ids: ["caption"],
      ran: ["caption"],
      reused: [
        {
          node_id: "gen",
          job_id: saved[0]!.job_id,
          asset_ids: [saved[0]!.id]
        }
      ]
    });
  });

  it("runs the generator, and not the sibling, when nothing is saved yet", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(
      runRequest({ node_ids: ["caption"] }),
      wf.id,
      { registry }
    );
    expect(res.status).toBe(200);
    expect(calls.sort()).toEqual(["echo:generated a cat", "gen"]);
  });

  it("runs the generator again with reuse_results false", async () => {
    const wf = await makeWorkflow();
    await handleWorkflowRun(runRequest({}), wf.id, { registry });
    calls.length = 0;
    const res = await handleWorkflowRun(
      runRequest({ node_ids: ["caption"], reuse_results: false }),
      wf.id,
      { registry }
    );
    expect(res.status).toBe(200);
    expect(calls).toContain("gen");
  });

  it.each([
    ["a string", { node_ids: "caption" }],
    ["an empty list", { node_ids: [] }],
    ["a list with a non-string", { node_ids: ["caption", 3] }],
    ["a non-boolean reuse_results", { node_ids: ["caption"], reuse_results: "no" }]
  ])("answers %s with a 400 and runs nothing", async (_label, body) => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(runRequest(body), wf.id, { registry });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("answers an unknown node id with a 400 naming it", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(
      runRequest({ node_ids: ["caption", "typo"] }),
      wf.id,
      { registry }
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("typo");
    expect(calls).toEqual([]);
  });
});
