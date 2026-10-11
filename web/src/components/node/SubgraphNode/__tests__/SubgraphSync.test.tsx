import React from "react";
import { act, render } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";

import { NodeProvider } from "../../../../contexts/NodeContext";
import { createNodeStore } from "../../../../stores/NodeStore";
import type { NodeStore } from "../../../../stores/NodeStore";
import type { NodeData } from "../../../../stores/NodeData";
import { SUBGRAPH_NODE_TYPE } from "../../../../constants/nodeTypes";
import { SubgraphSync } from "../SubgraphSync";

const innerInput = (name: string) => ({
  id: `in-${name}`,
  type: "nodetool.input.StringInput",
  data: { name, value: "" }
});

const innerOutput = (name: string) => ({
  id: `out-${name}`,
  type: "nodetool.output.Output",
  data: { name, value: null }
});

const plainNode = (id: string): Node<NodeData> => ({
  id,
  type: "test.Text",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

const subgraphNode = (innerNodes: unknown[]): Node<NodeData> => ({
  id: "sub",
  type: SUBGRAPH_NODE_TYPE,
  position: { x: 0, y: 0 },
  data: {
    properties: { graph: { nodes: innerNodes, edges: [] } },
    selectable: true,
    dynamic_properties: { a: "", b: "" },
    dynamic_outputs: {
      out: { type: "any", optional: false, type_args: [] }
    },
    workflow_id: "wf"
  }
});

const edges: Edge[] = [
  {
    id: "src-a",
    source: "src",
    sourceHandle: "output",
    target: "sub",
    targetHandle: "a"
  },
  {
    id: "src-b",
    source: "src",
    sourceHandle: "output",
    target: "sub",
    targetHandle: "b"
  },
  {
    id: "out-dst",
    source: "sub",
    sourceHandle: "out",
    target: "dst",
    targetHandle: "input"
  }
];

const renderSync = (store: NodeStore) => {
  const data = store.getState().findNode("sub")?.data as NodeData;
  return render(
    <NodeProvider createStore={() => store}>
      <SubgraphSync nodeId="sub" data={data} />
    </NodeProvider>
  );
};

describe("SubgraphSync", () => {
  it("drops outer edges on ports whose inner Input or Output is gone", () => {
    // Inner graph keeps Input `a` and loses Input `b` and Output `out`.
    const store = createNodeStore(undefined, {
      nodes: [
        plainNode("src"),
        plainNode("dst"),
        subgraphNode([innerInput("a"), innerOutput("renamed")])
      ],
      edges
    });
    act(() => {
      renderSync(store);
    });

    const state = store.getState();
    const sub = state.findNode("sub");
    expect(Object.keys(sub?.data.dynamic_properties ?? {})).toEqual(["a"]);
    expect(Object.keys(sub?.data.dynamic_outputs ?? {})).toEqual(["renamed"]);
    expect(state.edges.map((e) => e.id)).toEqual(["src-a"]);
  });

  it("leaves edges alone while every port still exists", () => {
    const store = createNodeStore(undefined, {
      nodes: [
        plainNode("src"),
        plainNode("dst"),
        subgraphNode([innerInput("a"), innerInput("b"), innerOutput("out")])
      ],
      edges
    });
    act(() => {
      renderSync(store);
    });

    expect(store.getState().edges.map((e) => e.id)).toEqual([
      "src-a",
      "src-b",
      "out-dst"
    ]);
  });
});
