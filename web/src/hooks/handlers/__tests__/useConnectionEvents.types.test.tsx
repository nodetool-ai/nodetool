import React from "react";
import { renderHook } from "@testing-library/react";
import type { Connection, Edge, Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import useMetadataStore from "../../../stores/MetadataStore";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeMetadata, TypeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { stub } from "../../../test-utils/doubles";
import { useConnectionEvents } from "../useConnectionEvents";

const t = (type: string, type_args: TypeMetadata[] = []): TypeMetadata => ({
  type,
  optional: false,
  values: null,
  type_args,
  type_name: null
});

const TEXT = stub<NodeMetadata>({
  node_type: "test.Text",
  title: "Text",
  properties: [
    { name: "text", title: "Text", type: t("str"), default: "" },
    { name: "image", title: "Image", type: t("image"), default: null },
    { name: "texts", title: "Texts", type: t("list", [t("str")]), default: [] }
  ],
  outputs: [{ name: "output", type: t("str") }],
  supports_dynamic_inputs: false
});

const FORMAT = stub<NodeMetadata>({
  node_type: "test.Format",
  title: "Format",
  properties: [],
  outputs: [{ name: "output", type: t("str") }],
  supports_dynamic_inputs: true
});

const makeNode = (
  id: string,
  type: string,
  data: Partial<NodeData> = {}
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf",
    ...data
  }
});

const connect = (
  target: string,
  targetHandle: string,
  source = "src"
): Connection => ({
  source,
  sourceHandle: "output",
  target,
  targetHandle
});

describe("useConnectionEvents type checks during the drag", () => {
  const originalMetadata = useMetadataStore.getState();

  beforeEach(() => {
    useMetadataStore.setState(
      {
        ...originalMetadata,
        metadata: { [TEXT.node_type]: TEXT, [FORMAT.node_type]: FORMAT }
      },
      true
    );
  });

  afterEach(() => {
    useMetadataStore.setState(originalMetadata, true);
  });

  const render = (edges: Edge[] = []) => {
    const store = createNodeStore(undefined, {
      nodes: [
        makeNode("src", TEXT.node_type),
        makeNode("dst", TEXT.node_type),
        makeNode("fmt", FORMAT.node_type, {
          dynamic_properties: { loose: "", typed: null },
          dynamic_inputs: { typed: { type: t("image") } }
        }),
        makeNode("unknown", "test.NotLoaded")
      ],
      edges
    });
    const { result } = renderHook(() => useConnectionEvents(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <NodeProvider createStore={() => store}>{children}</NodeProvider>
      )
    });
    return result.current.isConnectionValid;
  };

  it("accepts a compatible static input", () => {
    expect(render()(connect("dst", "text"))).toBe(true);
  });

  it("rejects an incompatible static input", () => {
    expect(render()(connect("dst", "image"))).toBe(false);
  });

  it("accepts a collect input", () => {
    expect(render()(connect("dst", "texts"))).toBe(true);
  });

  it("accepts an untyped dynamic input", () => {
    expect(render()(connect("fmt", "loose"))).toBe(true);
  });

  it("rejects a typed dynamic input of another type", () => {
    expect(render()(connect("fmt", "typed"))).toBe(false);
  });

  it("accepts a node whose metadata is not loaded", () => {
    expect(render()(connect("unknown", "anything"))).toBe(true);
  });

  it("accepts dropping a reconnected edge back on its own handle", () => {
    const edge: Edge = { id: "e1", ...connect("dst", "text") } as Edge;
    expect(render([edge])(connect("dst", "text"))).toBe(true);
  });

  it("rejects a control edge from a node that is not an agent", () => {
    expect(
      render()({
        source: "src",
        sourceHandle: "__control__",
        target: "dst",
        targetHandle: "__control__"
      })
    ).toBe(false);
  });
});
