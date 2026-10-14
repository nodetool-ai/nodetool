import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";

import { NodeProvider } from "../../../../contexts/NodeContext";
import { createNodeStore } from "../../../../stores/NodeStore";
import type { NodeStore } from "../../../../stores/NodeStore";
import type { NodeData } from "../../../../stores/NodeData";
import { FalSchemaLoader } from "../FalSchemaLoader";

const mockResolveFalSchemaClient = jest.fn();

jest.mock("../../../ui_primitives", () => ({
  ...jest.requireActual("../../../ui_primitives/spacing"),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Caption: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LoadingSpinner: () => <span data-testid="loading-spinner" />,
  ToolbarIconButton: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

jest.mock("../../../../stores/BASE_URL", () => ({
  BASE_URL: ""
}));

jest.mock("../../../../utils/falDynamicSchema", () => ({
  resolveFalSchemaClient: (...args: unknown[]) =>
    mockResolveFalSchemaClient(...args)
}));

const slot = (type: string) => ({
  type: { type, optional: false, values: null, type_args: [], type_name: null }
});

const plainNode = (id: string): Node<NodeData> => ({
  id,
  type: "test.Node",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

const falNode: Node<NodeData> = {
  id: "fal",
  type: "fal.DynamicFal",
  position: { x: 0, y: 0 },
  data: {
    properties: { model_info: "fal-ai/old-video" },
    selectable: true,
    dynamic_properties: { image_url: "", prompt: "" },
    dynamic_inputs: { image_url: slot("image"), prompt: slot("str") },
    dynamic_outputs: { video: { type: "video", optional: false, type_args: [] } },
    endpoint_id: "fal-ai/old-video",
    workflow_id: "wf"
  }
};

const edges: Edge[] = [
  { id: "in-image", source: "src", sourceHandle: "output", target: "fal", targetHandle: "image_url" },
  { id: "in-prompt", source: "src", sourceHandle: "output", target: "fal", targetHandle: "prompt" },
  { id: "out-video", source: "fal", sourceHandle: "video", target: "dst", targetHandle: "input" }
];

const loader = (store: NodeStore) => (
  <NodeProvider createStore={() => store}>
    <FalSchemaLoader
      nodeId="fal"
      data={store.getState().findNode("fal")?.data as NodeData}
    />
  </NodeProvider>
);

describe("FalSchemaLoader", () => {
  beforeEach(() => {
    mockResolveFalSchemaClient.mockReset();
    mockResolveFalSchemaClient.mockResolvedValue({
      dynamic_properties: { prompt: "" },
      dynamic_inputs: { prompt: { type: "str" } },
      dynamic_outputs: { images: { type: "list", type_args: [] } },
      endpoint_id: "fal-ai/new-image"
    });
  });

  it("reloads the schema when model_info changes and drops edges on removed handles", async () => {
    const store = createNodeStore(undefined, {
      nodes: [plainNode("src"), plainNode("dst"), falNode],
      edges
    });
    const { rerender } = render(loader(store));
    expect(mockResolveFalSchemaClient).not.toHaveBeenCalled();

    act(() => {
      store.getState().updateNodeProperties("fal", {
        model_info: "fal-ai/new-image"
      });
    });
    rerender(loader(store));

    await waitFor(() => {
      expect(store.getState().findNode("fal")?.data.endpoint_id).toBe(
        "fal-ai/new-image"
      );
    });
    expect(mockResolveFalSchemaClient).toHaveBeenCalledWith(
      "fal-ai/new-image",
      ""
    );
    expect(store.getState().edges.map((e) => e.id)).toEqual(["in-prompt"]);
  });
});
