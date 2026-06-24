jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200
}));

import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";
import { Workflow } from "../ApiTypes";

const createMockWorkflow = (): Workflow =>
  ({
    id: "wf",
    name: "Test Workflow",
    graph: { nodes: [], edges: [] },
    engine: "mem"
  } as unknown as Workflow);

it("round-trips a populated selected_generations array through ui_properties", () => {
  const rf = {
    id: "n1",
    type: "nodetool.image.Scale",
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      dynamic_properties: {},
      workflow_id: "wf",
      selected_generations: ["a1", "a2", "a3"]
    }
  } as never;

  const graph = reactFlowNodeToGraphNode(rf);
  expect(
    (graph.ui_properties as Record<string, unknown>).selected_generations
  ).toEqual(["a1", "a2", "a3"]);

  const back = graphNodeToReactFlowNode(createMockWorkflow(), graph);
  expect(back.data.selected_generations).toEqual(["a1", "a2", "a3"]);
});

it("leaves selected_generations undefined when unset", () => {
  const rf = {
    id: "n1",
    type: "nodetool.image.Scale",
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      dynamic_properties: {},
      workflow_id: "wf"
    }
  } as never;

  const graph = reactFlowNodeToGraphNode(rf);
  expect(
    (graph.ui_properties as Record<string, unknown>).selected_generations
  ).toBeUndefined();

  const back = graphNodeToReactFlowNode(createMockWorkflow(), graph);
  expect(back.data.selected_generations).toBeUndefined();
});

it("does not disturb the singular selected_generation field", () => {
  const rf = {
    id: "n1",
    type: "nodetool.image.Scale",
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      dynamic_properties: {},
      workflow_id: "wf",
      selected_generation: "a1",
      selected_generations: ["a1", "a2"]
    }
  } as never;

  const graph = reactFlowNodeToGraphNode(rf);
  expect(
    (graph.ui_properties as Record<string, unknown>).selected_generation
  ).toBe("a1");

  const back = graphNodeToReactFlowNode(createMockWorkflow(), graph);
  expect(back.data.selected_generation).toBe("a1");
  expect(back.data.selected_generations).toEqual(["a1", "a2"]);
});
