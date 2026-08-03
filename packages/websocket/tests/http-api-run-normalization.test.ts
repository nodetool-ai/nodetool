/**
 * `POST /api/workflows/:id/run|debug` normalizes the saved graph with the
 * shared `normalizeGraph` every other host uses. It used to hand-roll it:
 * editor-only nodes survived (a workflow with a Comment ran on the CLI and
 * failed here with "Unknown node type") and a control edge stored under the
 * editor's `type` key executed as a data edge.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "node:os";
import { initTestDb, Workflow, Job } from "@nodetool-ai/models";
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

const { handleWorkflowRun } = await import("../src/http-api.js");

const echoExecutor = {
  async process(
    ins: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return ins;
  }
};

// An editor-only node has no executor anywhere: resolving one is the failure
// this normalization prevents.
const registry = {
  has: (t: string) => t === "test.Echo" || t === "nodetool.output.Output",
  resolve: (node: { type: string }) => {
    if (!node.type.startsWith("test.") && node.type !== "nodetool.output.Output") {
      throw new Error(`Unknown node type "${node.type}"`);
    }
    return echoExecutor;
  },
  getClass: () => undefined,
  resolveMetadata: () => undefined,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

beforeEach(async () => {
  await initTestDb();
});

describe("handleWorkflowRun graph normalization", () => {
  it("prunes editor-only nodes and their edges, and lifts data to properties", async () => {
    const workflow = (await Workflow.create({
      user_id: "user-1",
      name: "Commented WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "note",
            type: "nodetool.workflows.base_node.Comment",
            data: { comment: ["a note"] }
          },
          { id: "work", type: "test.Echo", data: { value: "hi" } },
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
          },
          // An edge onto the comment: it must go with the node it touches.
          {
            source: "note",
            sourceHandle: "value",
            target: "out",
            targetHandle: "value"
          }
        ]
      }
    })) as Workflow;

    const res = await handleWorkflowRun(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "x-user-id": "user-1", "content-type": "application/json" },
        body: JSON.stringify({})
      }),
      workflow.id,
      { registry }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("completed");

    const [jobs] = await Job.paginate("user-1", {
      workflowId: workflow.id,
      limit: 10
    });
    expect(jobs).toHaveLength(1);
    const graph = jobs[0].graph as {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
    expect(graph.nodes.map((n) => n.id)).toEqual(["work", "out"]);
    expect(graph.nodes[0].properties).toEqual({ value: "hi" });
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].edge_type).toBe("data");
  });

  it("reads a control edge stored under the editor's `type` key", async () => {
    const workflow = (await Workflow.create({
      user_id: "user-1",
      name: "Control WF",
      access: "private",
      graph: {
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
          },
          {
            source: "work",
            sourceHandle: "value",
            target: "out",
            targetHandle: "__control__",
            type: "control"
          }
        ]
      }
    })) as Workflow;

    await handleWorkflowRun(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "x-user-id": "user-1", "content-type": "application/json" },
        body: JSON.stringify({})
      }),
      workflow.id,
      { registry }
    );

    const [jobs] = await Job.paginate("user-1", {
      workflowId: workflow.id,
      limit: 10
    });
    const graph = jobs[0].graph as { edges: Array<Record<string, unknown>> };
    const control = graph.edges.find((e) => e.targetHandle === "__control__");
    expect(control?.edge_type).toBe("control");
    expect(control?.type).toBeUndefined();
  });
});
