import { renderHook } from "@testing-library/react";
import { asMock } from "../../../../test-utils/doubles";
import type { Edge, Node } from "@xyflow/react";

import { useVariablePassthroughOutputs } from "../promptComposer/useVariablePassthroughOutputs";
import { useNodes } from "../../../../contexts/NodeContext";
import useMetadataStore from "../../../../stores/MetadataStore";
import type { NodeData } from "../../../../stores/NodeData";
import type { TypeMetadata } from "../../../../stores/ApiTypes";

jest.mock("../../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockUpdateNodeData = jest.fn();

const IMAGE_TYPE: TypeMetadata = {
  type: "image",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};
const ANY_TYPE: TypeMetadata = {
  type: "any",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const imageSourceNode = {
  id: "img-1",
  type: "test.ImageNode",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf-1"
  }
} as Node<NodeData>;

const imageSourceMetadata = {
  node_type: "test.ImageNode",
  properties: [],
  outputs: [{ name: "output", type: IMAGE_TYPE, stream: false }]
};

const setupStore = (edges: Edge[]) => {
  asMock(useNodes).mockImplementation(
    <T,>(selector: (s: unknown) => T) =>
      selector({
        edges,
        findNode: (id: string) => (id === "img-1" ? imageSourceNode : undefined),
        updateNodeData: mockUpdateNodeData
      })
  );
  asMock(useMetadataStore).mockImplementation(
    <T,>(selector: (s: unknown) => T) =>
      selector({ getMetadata: () => imageSourceMetadata })
  );
};

describe("useVariablePassthroughOutputs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mirrors variables onto dynamic inputs and outputs as `any` when unconnected", () => {
    setupStore([]);

    renderHook(() =>
      useVariablePassthroughOutputs("node-1", ["var_1", "var_2"], {}, {})
    );

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_inputs: { var_1: { type: ANY_TYPE }, var_2: { type: ANY_TYPE } },
      dynamic_outputs: { var_1: ANY_TYPE, var_2: ANY_TYPE }
    });
  });

  it("adopts the type of whatever is wired into the variable", () => {
    setupStore([
      {
        id: "e1",
        source: "img-1",
        sourceHandle: "output",
        target: "node-1",
        targetHandle: "var_1"
      }
    ]);

    renderHook(() => useVariablePassthroughOutputs("node-1", ["var_1"], {}, {}));

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_inputs: { var_1: { type: IMAGE_TYPE } },
      dynamic_outputs: { var_1: IMAGE_TYPE }
    });
  });

  it("does not write when the maps already match", () => {
    setupStore([]);

    renderHook(() =>
      useVariablePassthroughOutputs(
        "node-1",
        ["var_1"],
        { var_1: { type: ANY_TYPE } },
        { var_1: ANY_TYPE }
      )
    );

    expect(mockUpdateNodeData).not.toHaveBeenCalled();
  });

  it("drops handles for deleted variables", () => {
    setupStore([]);

    renderHook(() =>
      useVariablePassthroughOutputs(
        "node-1",
        ["var_1"],
        { var_1: { type: ANY_TYPE }, var_2: { type: ANY_TYPE } },
        { var_1: ANY_TYPE, var_2: ANY_TYPE }
      )
    );

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_inputs: { var_1: { type: ANY_TYPE } },
      dynamic_outputs: { var_1: ANY_TYPE }
    });
  });

  it("skips a variable named output so the rendered text keeps its handle", () => {
    setupStore([]);

    renderHook(() =>
      useVariablePassthroughOutputs("node-1", ["output", "var_1"], {}, {})
    );

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_inputs: { var_1: { type: ANY_TYPE } },
      dynamic_outputs: { var_1: ANY_TYPE }
    });
  });
});
