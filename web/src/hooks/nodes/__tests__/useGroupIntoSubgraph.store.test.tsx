import React from "react";
import { act, renderHook } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import useMetadataStore from "../../../stores/MetadataStore";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeStore } from "../../../stores/NodeStore";
import type { NodeMetadata, TypeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { SUBGRAPH_NODE_TYPE } from "../../../constants/nodeTypes";
import { stub } from "../../../test-utils/doubles";
import { useGroupIntoSubgraph } from "../useGroupIntoSubgraph";

const STR: TypeMetadata = {
  type: "str",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const TEXT_METADATA = stub<NodeMetadata>({
  node_type: "test.Text",
  title: "Text",
  namespace: "test",
  properties: [{ name: "input", title: "Input", type: STR, default: "" }],
  outputs: [{ name: "output", type: STR }],
  supports_dynamic_inputs: false,
  supports_dynamic_outputs: false
});

const SUBGRAPH_METADATA = stub<NodeMetadata>({
  node_type: SUBGRAPH_NODE_TYPE,
  title: "Subgraph",
  namespace: "nodetool.workflows.subgraph",
  properties: [
    {
      name: "graph",
      title: "Graph",
      type: { type: "dict", optional: false, type_args: [] },
      default: { nodes: [], edges: [] }
    }
  ],
  outputs: [],
  supports_dynamic_inputs: true,
  supports_dynamic_outputs: true
});

const makeNode = (id: string, x: number): Node<NodeData> => ({
  id,
  type: TEXT_METADATA.node_type,
  position: { x, y: 0 },
  data: {
    properties: { input: "" },
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

const makeEdge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  sourceHandle: "output",
  target,
  targetHandle: "input"
});

describe("useGroupIntoSubgraph against a real NodeStore", () => {
  const originalMetadata = useMetadataStore.getState();
  let store: NodeStore;

  beforeEach(() => {
    useMetadataStore.setState(
      {
        ...originalMetadata,
        metadata: {
          [TEXT_METADATA.node_type]: TEXT_METADATA,
          [SUBGRAPH_METADATA.node_type]: SUBGRAPH_METADATA
        }
      },
      true
    );
    store = createNodeStore(undefined, {
      nodes: [makeNode("a", 0), makeNode("b", 200), makeNode("c", 400)],
      edges: [makeEdge("a", "b"), makeEdge("b", "c")]
    });
    store.temporal.getState().clear();
  });

  afterEach(() => {
    useMetadataStore.setState(originalMetadata, true);
  });

  const renderGroup = () =>
    renderHook(() => useGroupIntoSubgraph(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <NodeProvider createStore={() => store}>{children}</NodeProvider>
      )
    });

  it("keeps both the incoming and the outgoing edge of the grouped node", () => {
    const { result } = renderGroup();
    let created: { subgraphNodeId: string } | null = null;
    act(() => {
      created = result.current(["b"]);
    });
    expect(created).not.toBeNull();
    const subgraphId = (created as unknown as { subgraphNodeId: string })
      .subgraphNodeId;

    const { nodes, edges } = store.getState();
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["a", "c", subgraphId].sort()
    );
    expect(
      edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle])
    ).toEqual(
      expect.arrayContaining([
        ["a", "output", subgraphId, "in1"],
        [subgraphId, "out1", "c", "input"]
      ])
    );
    expect(edges).toHaveLength(2);

    const subgraph = nodes.find((n) => n.id === subgraphId);
    expect(Object.keys(subgraph?.data.dynamic_outputs ?? {})).toEqual([
      "out1"
    ]);
    expect(Object.keys(subgraph?.data.dynamic_properties ?? {})).toEqual([
      "in1"
    ]);
  });

  it("records the whole rewrite as one undo step", () => {
    const { result } = renderGroup();
    act(() => {
      result.current(["b"]);
    });
    expect(store.temporal.getState().pastStates).toHaveLength(1);

    act(() => {
      store.temporal.getState().undo();
    });
    const { nodes, edges } = store.getState();
    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(edges.map((e) => e.id)).toEqual(["a-b", "b-c"]);
  });
});
