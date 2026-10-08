jest.mock("../../../components/node_types/PlaceholderNode", () => () => null);

import type { Workflow } from "../../../stores/ApiTypes";
import { createNodeStore } from "../../../stores/NodeStore";
import { importWorkflowGraph } from "../importWorkflowFile";

const workflow = {
  id: "wf-import",
  name: "Imported",
  access: "private",
  graph: { nodes: [], edges: [] },
  settings: { setup: { stage: "idea" } },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  description: "",
  thumbnail: "",
  tags: []
} as unknown as Workflow;

const imported = {
  nodes: [
    {
      id: "n1",
      type: "nodetool.constant.String",
      data: { value: "hi" },
      ui_properties: { position: { x: 0, y: 0 } }
    },
    {
      id: "n2",
      type: "nodetool.output.Output",
      data: {},
      ui_properties: { position: { x: 200, y: 0 } }
    }
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      sourceHandle: "output",
      target: "n2",
      targetHandle: "value"
    }
  ]
};

describe("importWorkflowGraph", () => {
  it("puts the graph on the canvas, so the next setup save keeps it", async () => {
    const nodeStore = createNodeStore(workflow);
    const saveWorkflow = jest.fn(async () => undefined);
    await importWorkflowGraph(
      {
        getWorkflow: () => workflow,
        updateWorkflow: jest.fn(),
        getNodeStore: () => nodeStore,
        saveWorkflow
      },
      workflow.id,
      imported
    );

    // The setup writer saves `getNodeStore(id).getState().getWorkflow()`
    // when it writes stage `done`; that copy must carry the import.
    const onCanvas = nodeStore.getState().getWorkflow().graph;
    expect(onCanvas.nodes.map((node) => node.id)).toEqual(["n1", "n2"]);
    const saved = (saveWorkflow.mock.calls[0] as unknown as [Workflow])[0];
    expect(saved.graph.nodes.map((node) => node.id)).toEqual(["n1", "n2"]);
  });
});
