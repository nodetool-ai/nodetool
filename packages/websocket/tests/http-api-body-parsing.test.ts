/**
 * The REST routes in `http-api.ts` parse their body once, at the boundary,
 * with a per-route Zod schema. The schemas are lenient on purpose: they encode
 * the fallbacks the routes used to apply inline with `typeof` checks, so a
 * malformed payload must land on exactly the answer it landed on before.
 *
 * Every case here is a malformed payload: a missing optional field, a
 * wrong-typed optional field (which must read as *absent*, never as a 400), an
 * unknown extra key, and a body that is not a JSON object at all.
 */
import os from "node:os";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initTestDb,
  Workflow,
  WorkflowVersion,
  Asset
} from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";

vi.mock("../src/lib/workflow-workspace.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/workflow-workspace.js")
  >("../src/lib/workflow-workspace.js");
  return {
    ...actual,
    resolveWorkflowWorkspace: async () => os.tmpdir()
  };
});

const {
  handleWorkflowRun,
  handleWorkflowAutosave,
  handleWorkflowsRoot,
  handleWorkflowById,
  handleWorkflowVersions,
  handleWorkflowsExportBundle,
  handleAssetsRoot,
  handleDebugSessionRequest
} = await import("../src/http-api.js");

const echoExecutor = {
  async process(
    ins: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return ins;
  }
};

const registry = {
  has: (t: string) => t === "test.Echo" || t === "nodetool.output.Output",
  resolve: () => echoExecutor,
  getClass: () => undefined,
  resolveMetadata: () => undefined,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

const GRAPH = {
  nodes: [
    { id: "work", type: "test.Echo", properties: { value: "hi" } },
    {
      id: "out",
      type: "nodetool.output.Output",
      name: "result",
      properties: {}
    }
  ],
  edges: [
    {
      source: "work",
      sourceHandle: "value",
      target: "out",
      targetHandle: "value"
    }
  ]
};

function jsonRequest(body: string, userId = "user-1"): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "x-user-id": userId, "content-type": "application/json" },
    body
  });
}

async function makeWorkflow(name = "WF"): Promise<Workflow> {
  return (await Workflow.create({
    user_id: "user-1",
    name,
    access: "private",
    graph: GRAPH
  })) as Workflow;
}

beforeEach(async () => {
  await initTestDb();
});

describe("POST /api/workflows/:id/run — body leniency", () => {
  it("runs with no body fields at all", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(jsonRequest("{}"), wf.id, { registry });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("completed");
    expect(body.background).toBe(false);
  });

  it("reads a wrong-typed max_decisions as absent instead of failing", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(
      jsonRequest(
        JSON.stringify({
          max_decisions: "three",
          max_retries_per_node: null,
          decision_timeout_ms: [1]
        })
      ),
      wf.id,
      { registry }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("completed");
  });

  it("ignores unknown extra keys", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(
      jsonRequest(JSON.stringify({ nonsense: { deep: 1 }, background: true })),
      wf.id,
      { registry }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.background).toBe(true);
  });

  it("treats a body that is not an object as no fields at all", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(jsonRequest("42"), wf.id, { registry });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.background).toBe(false);
  });

  it("treats an unparseable body as no body", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowRun(jsonRequest("{oops"), wf.id, {
      registry
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("completed");
  });
});

describe("POST /api/workflows — body leniency", () => {
  it("400s with 'Invalid workflow' when name is missing", async () => {
    const res = await handleWorkflowsRoot(
      jsonRequest(JSON.stringify({ access: "private", graph: GRAPH })),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Invalid workflow");
  });

  it("reads a wrong-typed name as absent, giving the same 400", async () => {
    const res = await handleWorkflowsRoot(
      jsonRequest(JSON.stringify({ name: 5, access: "private", graph: GRAPH })),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Invalid workflow");
  });

  it("keeps the graph message when the graph is malformed", async () => {
    const res = await handleWorkflowsRoot(
      jsonRequest(JSON.stringify({ name: "A", access: "private", graph: {} })),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe(
      "graph is required and must have nodes and edges arrays"
    );
  });

  it("answers a non-object body with 'Invalid workflow', not 'Invalid JSON body'", async () => {
    const res = await handleWorkflowsRoot(jsonRequest("123"), {});
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Invalid workflow");
  });

  it("answers a non-JSON request with 'Invalid JSON body'", async () => {
    const res = await handleWorkflowsRoot(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "x-user-id": "user-1", "content-type": "text/plain" },
        body: "hello"
      }),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Invalid JSON body");
  });

  it("creates the workflow and drops unknown extra keys", async () => {
    const res = await handleWorkflowsRoot(
      jsonRequest(
        JSON.stringify({
          name: "A",
          access: "private",
          graph: GRAPH,
          surprise: "kept out of the row"
        })
      ),
      {}
    );
    expect(res.status).toBe(200);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created.name).toBe("A");
    expect(created.surprise).toBeUndefined();
  });
});

describe("PUT /api/workflows/:id — body leniency", () => {
  it("reads a wrong-typed name as absent, giving 'Invalid workflow'", async () => {
    const wf = await makeWorkflow();
    const res = await handleWorkflowById(
      new Request("http://localhost/x", {
        method: "PUT",
        headers: { "x-user-id": "user-1", "content-type": "application/json" },
        body: JSON.stringify({
          name: { a: 1 },
          access: "private",
          graph: GRAPH
        })
      }),
      wf.id,
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Invalid workflow");
  });
});

describe("POST /api/workflows/export-bundle — body leniency", () => {
  it("400s when workflow_ids is wrong-typed", async () => {
    const res = await handleWorkflowsExportBundle(
      jsonRequest(JSON.stringify({ workflow_ids: "wf-1" })),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe(
      "workflow_ids (non-empty array) is required"
    );
  });

  it("400s when the body is missing entirely", async () => {
    const res = await handleWorkflowsExportBundle(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "x-user-id": "user-1" }
      }),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe(
      "workflow_ids (non-empty array) is required"
    );
  });

  it("drops non-string entries and looks up the rest", async () => {
    const res = await handleWorkflowsExportBundle(
      jsonRequest(JSON.stringify({ workflow_ids: [7, null, "missing-wf"] })),
      {}
    );
    // "missing-wf" survives the filter and 404s; the numbers never reach the DB.
    expect(res.status).toBe(404);
  });

  it("400s when every entry is dropped", async () => {
    const res = await handleWorkflowsExportBundle(
      jsonRequest(JSON.stringify({ workflow_ids: [7, null], extra: 1 })),
      {}
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/assets — body leniency", () => {
  const required =
    "Invalid JSON body: name, content_type, and parent_id are required";

  it("400s when name is missing", async () => {
    const res = await handleAssetsRoot(
      jsonRequest(
        JSON.stringify({ content_type: "text/plain", parent_id: "1" })
      ),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe(required);
  });

  it("reads a wrong-typed name as absent, giving the same 400", async () => {
    const res = await handleAssetsRoot(
      jsonRequest(
        JSON.stringify({
          name: 12,
          content_type: "text/plain",
          parent_id: "1"
        })
      ),
      {}
    );
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe(required);
  });

  it("400s the same way for a body that is not an object", async () => {
    const res = await handleAssetsRoot(jsonRequest("[]"), {});
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe(required);
  });

  it("creates the asset and drops unknown extra keys", async () => {
    const res = await handleAssetsRoot(
      jsonRequest(
        JSON.stringify({
          name: "note.txt",
          content_type: "text/plain",
          parent_id: "user-1",
          surprise: 1
        })
      ),
      {}
    );
    expect(res.status).toBe(200);
    const asset = (await res.json()) as Record<string, unknown>;
    expect(asset.name).toBe("note.txt");
    expect(asset.surprise).toBeUndefined();
    expect(await Asset.get(asset.id as string)).toBeTruthy();
  });
});

describe("POST /api/debug/sessions/:id/verdict — body leniency", () => {
  it("checks the session before the body, so a malformed body still 404s", async () => {
    const res = await handleDebugSessionRequest(
      jsonRequest(JSON.stringify({ escalation_id: 9 })),
      "no-such-session",
      "verdict",
      {}
    );
    expect(res.status).toBe(404);
    expect((await res.json()).detail).toBe("Debug session not found");
  });
});
