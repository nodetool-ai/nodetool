import { beforeEach, describe, expect, it } from "vitest";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";

const USER_ID = "workflow-revision-user";
const SOURCE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const EDGE_ID = "cccccccccccccccccccccccccccccccc";

beforeEach(() => initTestDb());

async function rejectStaleMutation(
  name: string,
  input: Record<string, unknown>,
  compactWorkflowId = false
): Promise<void> {
  const context = new ProcessingContext({
    userId: USER_ID,
    jobId: "revision-test"
  });
  const workflow = await Workflow.create<Workflow>({
    user_id: USER_ID,
    name: "Revision boundary",
    graph: {
      nodes: [
        {
          id: SOURCE_ID,
          type: "nodetool.text.Value",
          data: { value: "original" },
          position: { x: 0, y: 0 }
        },
        {
          id: TARGET_ID,
          type: "nodetool.text.Value",
          data: {},
          position: { x: 240, y: 0 }
        }
      ],
      edges: [
        {
          id: EDGE_ID,
          source: SOURCE_ID,
          sourceHandle: "output",
          target: TARGET_ID,
          targetHandle: "value"
        }
      ]
    }
  });
  const readTool = toolForCapabilityName("ui_get_graph");
  const before = (await readTool.process(context, {
    workflow_id: workflow.id
  })) as Record<string, unknown>;
  expect(before.source).toBe("server");
  expect(before.document_revision).toMatch(/^graph:[a-f0-9]{64}$/);

  const changed = (await toolForCapabilityName("ui_set_node_title").process(
    context,
    {
      workflow_id: workflow.id,
      node_id: SOURCE_ID,
      title: "Changed after the read",
      based_on_revision: before.document_revision
    }
  )) as Record<string, unknown>;
  expect(changed.ok).toBe(true);
  expect(changed.document_revision).not.toBe(before.document_revision);
  const current = await Workflow.get<Workflow>(workflow.id);
  expect(current?.graph.nodes[0].ui_properties).toMatchObject({
    title: "Changed after the read"
  });

  const result = await toolForCapabilityName(name).process(context, {
    ...input,
    workflow_id: compactWorkflowId ? workflow.id.slice(0, 12) : workflow.id,
    based_on_revision: before.document_revision
  });
  expect(result).toMatchObject({
    error: "document_revision_conflict",
    source: "server",
    document_revision: changed.document_revision
  });
  const persisted = await Workflow.get<Workflow>(workflow.id);
  expect(persisted?.graph).toEqual(current?.graph);
  expect(persisted?.updated_at).toBe(current?.updated_at);
  const after = (await readTool.process(context, {
    workflow_id: workflow.id
  })) as Record<string, unknown>;
  expect(after.document_revision).toBe(changed.document_revision);
}

describe("saved workflow revision boundaries", () => {
  it("ui_add_node rejects a stale revision before metadata lookup", async () => {
    await rejectStaleMutation(
      "ui_add_node",
      {
        id: "dddddddddddddddddddddddddddddddd",
        type: "nodetool.text.Value",
        position: { x: 480, y: 0 }
      },
      true
    );
  });

  it("ui_connect_nodes rejects a stale revision for a compact workflow id", async () => {
    await rejectStaleMutation(
      "ui_connect_nodes",
      {
        source_node_id: SOURCE_ID,
        source_handle: "output",
        target_node_id: TARGET_ID,
        target_handle: "value"
      },
      true
    );
  });

  it("ui_update_node_data rejects a stale revision without changing properties", async () => {
    await rejectStaleMutation("ui_update_node_data", {
      node_id: SOURCE_ID,
      data: { properties: { value: "stale" } }
    });
  });

  it("ui_delete_node rejects a stale revision without removing connected nodes", async () => {
    await rejectStaleMutation("ui_delete_node", { node_id: SOURCE_ID });
  });

  it("ui_delete_edge rejects a stale revision without removing the edge", async () => {
    await rejectStaleMutation("ui_delete_edge", { edge_id: EDGE_ID });
  });

  it("ui_move_node rejects a stale revision without moving the node", async () => {
    await rejectStaleMutation("ui_move_node", {
      node_id: TARGET_ID,
      position: { x: 600, y: 200 }
    });
  });

  it("ui_set_node_title rejects a stale revision without overwriting the newer title", async () => {
    await rejectStaleMutation("ui_set_node_title", {
      node_id: SOURCE_ID,
      title: "Stale title"
    });
  });
});

describe("ui_get_graph last_run", () => {
  it("returns the editor's last_run unchanged when a renderer serves the read", async () => {
    const editorGraph = {
      source: "editor",
      document_revision: `graph:${"a".repeat(64)}`,
      nodes: [
        {
          id: SOURCE_ID,
          type: "nodetool.text.Value",
          last_run: { status: "error", error: "boom", output: null }
        }
      ],
      edges: []
    };
    const calls: Array<[string, Record<string, unknown>]> = [];
    const run = createCapabilityRun({
      context: new ProcessingContext({ userId: USER_ID, jobId: "last-run-editor" }),
      gate: UNGATED,
      client: {
        execute: async (name, args) => {
          calls.push([name, args]);
          return editorGraph;
        }
      }
    });

    await expect(run.invoke("ui_get_graph", {})).resolves.toEqual(editorGraph);
    expect(calls).toEqual([["ui_get_graph", {}]]);
  });

  it("reads a saved workflow without last_run when no editor is reachable", async () => {
    const workflow = await Workflow.create<Workflow>({
      user_id: USER_ID,
      name: "No canvas run",
      graph: {
        nodes: [
          {
            id: SOURCE_ID,
            type: "nodetool.text.Value",
            data: { value: "saved" },
            position: { x: 0, y: 0 }
          }
        ],
        edges: []
      }
    });
    const run = createCapabilityRun({
      context: new ProcessingContext({ userId: USER_ID, jobId: "last-run-server" }),
      gate: UNGATED
    });

    const read = (await run.invoke("ui_get_graph", {
      workflow_id: workflow.id
    })) as { source: unknown; nodes: Array<Record<string, unknown>> };

    expect(read.source).toBe("server");
    expect(read.nodes.map((node) => node.id)).toEqual([SOURCE_ID]);
    expect(read.nodes.some((node) => "last_run" in node)).toBe(false);
  });
});
