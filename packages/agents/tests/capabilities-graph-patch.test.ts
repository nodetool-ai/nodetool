import { beforeEach, describe, expect, it } from "vitest";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const USER_ID = "graph-patch-user";
const SOURCE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const EDGE_ID = "cccccccccccccccccccccccccccccccc";

beforeEach(() => initTestDb());

async function savedWorkflow(): Promise<Workflow> {
  return Workflow.create<Workflow>({
    user_id: USER_ID,
    name: "Graph patch",
    graph: {
      nodes: [
        { id: SOURCE_ID, type: "nodetool.text.Value", data: {}, position: { x: 0, y: 0 } },
        { id: TARGET_ID, type: "nodetool.text.Value", data: {}, position: { x: 240, y: 0 } }
      ],
      edges: [
        { id: EDGE_ID, source: SOURCE_ID, sourceHandle: "output", target: TARGET_ID, targetHandle: "value" }
      ]
    }
  });
}

const context = () => new ProcessingContext({ userId: USER_ID, jobId: "graph-patch-test" });

describe("ui_apply_graph_patch", () => {
  it("ui_apply_graph_patch applies every entry in one saved write", async () => {
    const workflow = await savedWorkflow();
    const result = (await toolForCapabilityName("ui_apply_graph_patch").process(context(), {
      workflow_id: workflow.id,
      delete_edge_ids: [EDGE_ID],
      move_nodes: [{ node_id: TARGET_ID, position: { x: 500, y: 80 } }]
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      ok: true,
      applied: [
        { op: "delete_edge_ids", edge_id: EDGE_ID },
        { op: "move_nodes", node_id: TARGET_ID }
      ]
    });
    const stored = await Workflow.get<Workflow>(workflow.id);
    expect(stored?.graph.edges).toEqual([]);
    expect(stored?.graph.nodes.find((n) => n.id === TARGET_ID)?.ui_properties).toMatchObject({
      position: { x: 500, y: 80 }
    });
  });

  it("ui_apply_graph_patch changes nothing when one entry fails", async () => {
    const workflow = await savedWorkflow();
    const before = await Workflow.get<Workflow>(workflow.id);

    await expect(
      toolForCapabilityName("ui_apply_graph_patch").process(context(), {
        workflow_id: workflow.id,
        delete_edge_ids: [EDGE_ID],
        delete_node_ids: ["dddddddddddddddddddddddddddddddd"]
      })
    ).rejects.toThrow(/delete_node_ids\[0\]: .* No change was applied\./);
    const after = await Workflow.get<Workflow>(workflow.id);
    expect(after?.graph).toEqual(before?.graph);
    expect(after?.updated_at).toBe(before?.updated_at);
  });
});
