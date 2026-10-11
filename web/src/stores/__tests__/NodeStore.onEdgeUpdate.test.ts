import type { Edge, Node } from "@xyflow/react";

import { stub } from "../../test-utils/doubles";
import type { NodeMetadata, TypeMetadata } from "../ApiTypes";
import type { NodeData } from "../NodeData";
import useMetadataStore from "../MetadataStore";
import { createNodeStore } from "../NodeStore";

const STR: TypeMetadata = {
  type: "str",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const LIST_STR: TypeMetadata = {
  type: "list",
  optional: false,
  values: null,
  type_args: [STR],
  type_name: null
};

const METADATA = stub<NodeMetadata>({
  node_type: "test.node",
  title: "Test",
  properties: [
    { name: "input", title: "Input", type: STR, default: "" },
    { name: "items", title: "Items", type: LIST_STR, default: [] }
  ],
  outputs: [{ name: "output", type: STR }]
});

const makeNode = (id: string): Node<NodeData> => ({
  id,
  type: METADATA.node_type,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

const edge = (id: string, source: string, target: string, handle: string): Edge => ({
  id,
  source,
  sourceHandle: "output",
  target,
  targetHandle: handle
});

describe("NodeStore.onEdgeUpdate", () => {
  const originalMetadata = useMetadataStore.getState();

  beforeEach(() => {
    useMetadataStore.setState(
      { ...originalMetadata, metadata: { [METADATA.node_type]: METADATA } },
      true
    );
  });

  afterEach(() => {
    useMetadataStore.setState(originalMetadata, true);
  });

  const setup = (handle: string) =>
    createNodeStore(undefined, {
      nodes: [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")],
      edges: [
        edge("occupant", "a", "c", handle),
        edge("moved", "b", "d", handle)
      ]
    });

  it("replaces the edge already on a single-value input", () => {
    const store = setup("input");
    const moved = store.getState().edges[1];
    store.getState().onEdgeUpdate(moved, {
      source: "b",
      sourceHandle: "output",
      target: "c",
      targetHandle: "input"
    });

    const edges = store.getState().edges;
    expect(edges.map((e) => [e.id, e.source, e.target])).toEqual([
      ["moved", "b", "c"]
    ]);
  });

  it("keeps the other edges on a collect input", () => {
    const store = setup("items");
    const moved = store.getState().edges[1];
    store.getState().onEdgeUpdate(moved, {
      source: "b",
      sourceHandle: "output",
      target: "c",
      targetHandle: "items"
    });

    const edges = store.getState().edges;
    expect(edges.map((e) => [e.id, e.source, e.target])).toEqual([
      ["occupant", "a", "c"],
      ["moved", "b", "c"]
    ]);
  });
});
