import { addEdge as xyflowAddEdge } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";

import { asMock, stub } from "../../../test-utils/doubles";
import type { NodeMetadata, TypeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useMetadataStore from "../../../stores/MetadataStore";
import { createNodeStore } from "../../../stores/NodeStore";
import {
  applyKeyboardConnection,
  buildKeyboardConnection,
  isKeyboardConnectionValid
} from "../keyboardConnection";

const STRING_TYPE: TypeMetadata = {
  type: "str",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const TEST_METADATA = stub<NodeMetadata>({
  node_type: "test.node",
  title: "Test node",
  properties: [
    {
      name: "input",
      title: "Input",
      type: STRING_TYPE,
      default: ""
    }
  ],
  outputs: [{ name: "output", type: STRING_TYPE }]
});

const makeNode = (
  id: string,
  position: { x: number; y: number },
  parentId?: string
): Node<NodeData> => ({
  id,
  type: TEST_METADATA.node_type,
  position,
  parentId,
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "workflow-1"
  }
});

const makeEdge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  sourceHandle: "output",
  target,
  targetHandle: "input"
});

describe("keyboard connection application", () => {
  const originalMetadata = useMetadataStore.getState();

  beforeEach(() => {
    asMock(xyflowAddEdge).mockImplementation(
      (edge: Edge, edges: Edge[]) => [...edges, edge]
    );
    useMetadataStore.setState(
      {
        ...originalMetadata,
        metadata: { [TEST_METADATA.node_type]: TEST_METADATA }
      },
      true
    );
  });

  afterEach(() => {
    useMetadataStore.setState(originalMetadata, true);
    asMock(xyflowAddEdge).mockReset();
  });

  it("excludes an existing port when the shared validator detects a cycle", () => {
    const store = createNodeStore();
    store.setState({
      nodes: [
        makeNode("a", { x: 0, y: 0 }),
        makeNode("b", { x: 100, y: 0 }),
        makeNode("c", { x: 200, y: 0 })
      ],
      edges: [makeEdge("a", "b"), makeEdge("b", "c")]
    });
    const connection = buildKeyboardConnection(
      { nodeId: "c", handleId: "output", direction: "source" },
      "a",
      "input"
    );

    expect(isKeyboardConnectionValid(store.getState(), connection)).toBe(
      false
    );
    expect(
      applyKeyboardConnection(store, {
        nodeId: "c",
        handleId: "output",
        direction: "source",
        option: { kind: "existing", nodeId: "a", handleId: "input" }
      })
    ).toBe(false);
    expect(store.getState().edges).toHaveLength(2);
  });

  it("does not report success when onConnect rejects the request", () => {
    const store = createNodeStore();
    store.setState({
      nodes: [
        makeNode("source", { x: 0, y: 0 }),
        makeNode("target", { x: 100, y: 0 })
      ],
      edges: [],
      onConnect: jest.fn()
    });

    expect(
      applyKeyboardConnection(store, {
        nodeId: "source",
        handleId: "output",
        direction: "source",
        option: {
          kind: "existing",
          nodeId: "target",
          handleId: "input"
        }
      })
    ).toBe(false);
  });

  it("places a new root node from the grouped source's absolute position", () => {
    const store = createNodeStore();
    store.setState({
      nodes: [
        makeNode("group", { x: 1_000, y: 500 }),
        makeNode("source", { x: 50, y: 60 }, "group")
      ],
      edges: []
    });

    expect(
      applyKeyboardConnection(store, {
        nodeId: "source",
        handleId: "output",
        direction: "source",
        option: {
          kind: "new",
          metadata: TEST_METADATA,
          handleId: "input"
        }
      })
    ).toBe(true);

    const created = store
      .getState()
      .nodes.find((node) => node.id !== "group" && node.id !== "source");
    expect(created?.parentId).toBeUndefined();
    expect(created?.position).toEqual({ x: 1_370, y: 560 });
    expect(store.getState().edges).toHaveLength(1);
  });
});
