import { render, screen, waitFor } from "@testing-library/react";

import WorkflowChainSurface from "../WorkflowChainSurface";
import { useChainEditorStore } from "../../chain_editor/useChainEditorStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { createNodeStore } from "../../../stores/NodeStore";
import type {
  NodeMetadata,
  Property,
  TypeMetadata,
  Workflow
} from "../../../stores/ApiTypes";

const saveWorkflow = jest.fn().mockResolvedValue(undefined);
const updateWorkflow = jest.fn();

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: <T,>(selector: (state: unknown) => T) =>
    selector({ saveWorkflow, updateWorkflow })
}));

jest.mock("../../chain_editor/ChainEditor", () => ({
  __esModule: true,
  ChainEditor: () => <div data-testid="chain-editor" />
}));

const strType: TypeMetadata = { type: "str", type_args: [], optional: false };

const makeMetadata = (nodeType: string): NodeMetadata =>
  ({
    title: nodeType,
    description: "",
    namespace: "test",
    node_type: nodeType,
    properties: [
      {
        name: "value",
        type: strType,
        default: "",
        description: "",
        required: false
      } as Property
    ],
    outputs: [{ name: "output", type: strType, stream: false }],
    layout: "default",
    supports_dynamic_inputs: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    recommended_models: [],
    required_settings: []
  }) as NodeMetadata;

const workflow: Workflow = {
  id: "wf-1",
  name: "Chain workflow",
  access: "private",
  created_at: "",
  updated_at: "",
  description: "",
  tags: [],
  graph: {
    nodes: [
      {
        id: "a",
        type: "test.A",
        data: { value: "hello" },
        ui_properties: { position: { x: 120, y: 40 } }
      },
      {
        id: "b",
        type: "test.B",
        data: {},
        ui_properties: { position: { x: 420, y: 40 } }
      }
    ],
    edges: [
      {
        id: "e1",
        source: "a",
        sourceHandle: "output",
        target: "b",
        targetHandle: "value"
      }
    ]
  }
} as unknown as Workflow;

describe("WorkflowChainSurface", () => {
  beforeEach(() => {
    saveWorkflow.mockClear();
    updateWorkflow.mockClear();
    useMetadataStore.getState().setMetadata({
      "test.A": makeMetadata("test.A"),
      "test.B": makeMetadata("test.B")
    });
    useChainEditorStore.getState().newWorkflow();
  });

  it("loads the tab's workflow into the chain store", async () => {
    const nodeStore = createNodeStore(workflow);

    render(
      <WorkflowChainSurface workflowId="wf-1" nodeStore={nodeStore} />
    );

    expect(screen.getByTestId("chain-editor")).toBeInTheDocument();
    await waitFor(() => {
      expect(useChainEditorStore.getState().workflowId).toBe("wf-1");
    });
    expect(useChainEditorStore.getState().chain.map((n) => n.id)).toEqual([
      "a",
      "b"
    ]);
  });

  it("mirrors chain edits back into the node store, keeping positions", async () => {
    const nodeStore = createNodeStore(workflow);

    render(
      <WorkflowChainSurface workflowId="wf-1" nodeStore={nodeStore} />
    );

    await waitFor(() => {
      expect(useChainEditorStore.getState().chain).toHaveLength(2);
    });

    useChainEditorStore.getState().updateProperty("a", "value", "edited");

    await waitFor(() => {
      const node = nodeStore.getState().nodes.find((n) => n.id === "a");
      expect(node?.data.properties.value).toBe("edited");
    });
    const nodeA = nodeStore.getState().nodes.find((n) => n.id === "a");
    expect(nodeA?.position).toEqual({ x: 120, y: 40 });
    expect(nodeStore.getState().edges).toHaveLength(1);
  });

  it("keeps nodes the chain view cannot represent", async () => {
    const withComment = {
      ...workflow,
      graph: {
        ...workflow.graph,
        nodes: [
          ...workflow.graph.nodes,
          {
            id: "c",
            type: "nodetool.workflows.base_node.Comment",
            data: {},
            ui_properties: { position: { x: 0, y: 300 } }
          }
        ]
      }
    } as unknown as Workflow;
    const nodeStore = createNodeStore(withComment);

    render(<WorkflowChainSurface workflowId="wf-1" nodeStore={nodeStore} />);

    await waitFor(() => {
      expect(useChainEditorStore.getState().chain).toHaveLength(2);
    });

    useChainEditorStore.getState().updateProperty("a", "value", "edited");

    await waitFor(() => {
      const node = nodeStore.getState().nodes.find((n) => n.id === "a");
      expect(node?.data.properties.value).toBe("edited");
    });
    expect(nodeStore.getState().nodes.map((n) => n.id).sort()).toEqual([
      "a",
      "b",
      "c"
    ]);
  });
});
