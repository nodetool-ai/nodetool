/**
 * Tests for the workflow graph merge adapter (`workflowMerge.ts`).
 *
 * The canvas holds live ReactFlow nodes and edges, which carry runtime fields
 * (`measured`, `selected`, `dragging`, …) the graph→ReactFlow conversion never
 * emits. The adapter strips those before the three-way compare, so merely
 * looking at a unit is not an edit.
 */
import { mergeWorkflowDocuments, type WorkflowMergeDoc } from "../workflowMerge";
import type { DocumentOp } from "@nodetool-ai/protocol";

const node = (
  id: string,
  data: Record<string, unknown>,
  position = { x: 0, y: 0 }
): Record<string, unknown> => ({
  id,
  type: "nodetool.text.Concat",
  position,
  data,
  width: 200,
  height: 100
});

const edge = (
  id: string,
  source: string,
  target: string
): Record<string, unknown> => ({
  id,
  source,
  target,
  sourceHandle: "output",
  targetHandle: "a"
});

describe("mergeWorkflowDocuments", () => {
  it("drops an edge the agent deleted even when the canvas has it selected", () => {
    const base: WorkflowMergeDoc = {
      nodes: [node("n1", { properties: {} }), node("n2", { properties: {} })],
      edges: [edge("e1", "n1", "n2")]
    };
    const draft: WorkflowMergeDoc = {
      nodes: base.nodes,
      // The user clicked the edge: ReactFlow stamped runtime state onto it.
      edges: [{ ...(base.edges[0] as object), selected: true }]
    };
    const server: WorkflowMergeDoc = { nodes: base.nodes, edges: [] };
    const ops: DocumentOp[] = [
      { tool: "ui_delete_edge", input: { edge_id: "e1" } }
    ];

    const result = mergeWorkflowDocuments(base, draft, server, ops);

    expect(result.doc.edges).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("merges an external move into a node the canvas measured and the user edited", () => {
    const base: WorkflowMergeDoc = {
      nodes: [node("n1", { properties: { text: "base" } })],
      edges: []
    };
    const draft: WorkflowMergeDoc = {
      nodes: [
        {
          ...(base.nodes[0] as object),
          data: { properties: { text: "draft" } },
          measured: { width: 200, height: 120 },
          selected: true,
          dragging: false
        }
      ],
      edges: []
    };
    const server: WorkflowMergeDoc = {
      nodes: [node("n1", { properties: { text: "base" } }, { x: 400, y: 80 })],
      edges: []
    };
    const ops: DocumentOp[] = [
      { tool: "ui_move_node", input: { node_id: "n1" } }
    ];

    const result = mergeWorkflowDocuments(base, draft, server, ops);

    expect(result.conflicts).toEqual([]);
    expect(result.doc.nodes[0]).toMatchObject({
      id: "n1",
      position: { x: 400, y: 80 },
      data: { properties: { text: "draft" } },
      // Runtime state the canvas owns survives the merge.
      measured: { width: 200, height: 120 },
      selected: true
    });
  });
});
