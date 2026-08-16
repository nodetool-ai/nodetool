jest.mock("../../node_types/PlaceholderNode", () => () => null);

jest.mock("../../node_types/code_assistant/CodeAssistantDialog", () => ({
  __esModule: true,
  default: ({
    nodeId,
    onClose,
    inputs,
    expectedOutput
  }: {
    nodeId: string;
    onClose: () => void;
    inputs?: unknown;
    expectedOutput?: unknown;
  }) => (
    <div>
      <span data-testid="dialog-node">{nodeId}</span>
      <span data-testid="dialog-inputs">
        {JSON.stringify(inputs ?? null)}
      </span>
      <span data-testid="dialog-expected">
        {JSON.stringify(expectedOutput ?? null)}
      </span>
      <button type="button" onClick={onClose}>
        Cancel generation
      </button>
    </div>
  )
}));

import { render, screen } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import userEvent from "@testing-library/user-event";
import { Position, type Edge, type Node } from "@xyflow/react";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import CodeGenDialogHost from "../CodeGenDialogHost";
import { NodeContext } from "../../../contexts/NodeContext";
import { useCodeGenFromHandle } from "../../../hooks/useCodeGenFromHandle";
import type { NodeMetadata, TypeMetadata } from "../../../stores/ApiTypes";
import useCodeGenDialogStore from "../../../stores/CodeGenDialogStore";
import useMetadataStore from "../../../stores/MetadataStore";
import type { NodeData } from "../../../stores/NodeData";
import { createNodeStore, type NodeStore } from "../../../stores/NodeStore";

const CODE_NODE_TYPE = "nodetool.code.Code";

const typeOf = (type: string): TypeMetadata =>
  ({
    type,
    optional: false,
    values: null,
    type_args: [],
    type_name: null
  }) as TypeMetadata;

const metadata = (
  nodeType: string,
  properties: { name: string; type: string }[],
  outputs: { name: string; type: string }[]
): NodeMetadata =>
  stub<NodeMetadata>({
    node_type: nodeType,
    title: nodeType,
    description: "",
    namespace: "test",
    layout: "default",
    properties: properties.map((property) => ({
      name: property.name,
      type: typeOf(property.type)
    })),
    outputs: outputs.map((output) => ({
      name: output.name,
      type: typeOf(output.type),
      stream: false
    })),
    recommended_models: [],
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true,
    is_streaming_output: false,
    required_settings: []
  });

const makeNode = (id: string, nodeType: string): Node<NodeData> => ({
  id,
  type: nodeType,
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "wf"
  }
});

/** Every edge field the graph is compared on, order-independent. */
const edgeShape = (edges: Edge[]) =>
  edges
    .map((edge) =>
      [
        edge.id,
        edge.source,
        edge.sourceHandle ?? "",
        edge.target,
        edge.targetHandle ?? ""
      ].join("|")
    )
    .sort();

const graphSnapshot = (store: NodeStore) => ({
  nodes: store
    .getState()
    .nodes.map((node) => node.id)
    .sort(),
  edges: edgeShape(store.getState().edges)
});

interface HarnessProps {
  store: NodeStore;
  onTransform?: () => void;
  onCreateValue?: () => void;
}

const Harness = ({ store, onTransform, onCreateValue }: HarnessProps) => (
  <NodeContext.Provider value={store}>
    <Triggers onTransform={onTransform} onCreateValue={onCreateValue} />
    <CodeGenDialogHost />
  </NodeContext.Provider>
);

const Triggers = ({
  onTransform,
  onCreateValue
}: Omit<HarnessProps, "store">) => {
  const { transformOutput, createValue } = useCodeGenFromHandle();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          transformOutput({
            sourceNodeId: "src-1",
            sourceHandle: "rows",
            sourceType: typeOf("list"),
            position: { x: 200, y: 0 }
          });
          onTransform?.();
        }}
      >
        transform output
      </button>
      <button
        type="button"
        onClick={() => {
          createValue({
            targetNodeId: "dst-1",
            targetHandle: "text",
            targetType: typeOf("str"),
            position: { x: -200, y: 0 }
          });
          onCreateValue?.();
        }}
      >
        create value
      </button>
    </>
  );
};

const setupStore = (sourceOutputType = "list"): NodeStore => {
  useMetadataStore.setState({
    metadata: {
      [CODE_NODE_TYPE]: metadata(
        CODE_NODE_TYPE,
        [
          { name: "code", type: "str" },
          { name: "timeout", type: "int" }
        ],
        []
      ),
      src: metadata("src", [], [{ name: "rows", type: sourceOutputType }]),
      upstream: metadata("upstream", [], [{ name: "output", type: "str" }]),
      dst: metadata("dst", [{ name: "text", type: "str" }], [])
    }
  } as never);

  const store = createNodeStore();
  store.setState({
    nodes: [
      makeNode("src-1", "src"),
      makeNode("dst-1", "dst"),
      makeNode("up-1", "upstream")
    ],
    edges: []
  });
  return store;
};

describe("Code Node AI authoring — handle entry points", () => {
  beforeEach(() => {
    useCodeGenDialogStore.setState({ request: null });
  });

  it("seeds an input slot named and typed from the source handle", async () => {
    const user = userEvent.setup();
    const store = setupStore();
    render(<Harness store={store} />);

    await user.click(screen.getByRole("button", { name: "transform output" }));

    const codeNode = store
      .getState()
      .nodes.find((node) => node.type === CODE_NODE_TYPE);
    expect(codeNode).toBeDefined();
    expect(codeNode?.data.dynamic_inputs?.rows.type.type).toBe("list");

    const edge = store.getState().edges[0];
    expect(edge).toMatchObject({
      source: "src-1",
      sourceHandle: "rows",
      target: codeNode?.id,
      targetHandle: "rows"
    });

    expect(screen.getByTestId("dialog-node")).toHaveTextContent(
      codeNode?.id ?? ""
    );
    const inputs = JSON.parse(
      screen.getByTestId("dialog-inputs").textContent ?? "null"
    ) as codeGen.CodeGenInputPort[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].name).toBe("rows");
    expect(inputs[0].type.type).toBe("list");
  });

  it("suffixes a seeded name that collides with the Code node's own property", async () => {
    const user = userEvent.setup();
    const store = setupStore();
    useMetadataStore.setState({
      metadata: {
        ...useMetadataStore.getState().metadata,
        src: metadata("src", [], [{ name: "code", type: "str" }])
      }
    } as never);

    render(
      <NodeContext.Provider value={store}>
        <CollidingTrigger />
        <CodeGenDialogHost />
      </NodeContext.Provider>
    );

    await user.click(screen.getByRole("button", { name: "transform code" }));

    const codeNode = store
      .getState()
      .nodes.find((node) => node.type === CODE_NODE_TYPE);
    expect(Object.keys(codeNode?.data.dynamic_inputs ?? {})).toEqual(["code_2"]);
    expect(store.getState().edges[0]).toMatchObject({
      sourceHandle: "code",
      targetHandle: "code_2"
    });
  });

  it("seeds the expected output from the destination handle", async () => {
    const user = userEvent.setup();
    const store = setupStore();
    render(<Harness store={store} />);

    await user.click(screen.getByRole("button", { name: "create value" }));

    const codeNode = store
      .getState()
      .nodes.find((node) => node.type === CODE_NODE_TYPE);
    expect(codeNode?.data.dynamic_outputs?.text.type).toBe("str");
    expect(store.getState().edges[0]).toMatchObject({
      source: codeNode?.id,
      sourceHandle: "text",
      target: "dst-1",
      targetHandle: "text"
    });

    const expected = JSON.parse(
      screen.getByTestId("dialog-expected").textContent ?? "null"
    ) as codeGen.CodeGenExpectedOutput;
    expect(expected.name).toBe("text");
    expect(expected.type.type).toBe("str");
  });

  it("creates neither node nor edge when the types are incompatible", async () => {
    const user = userEvent.setup();
    // The handle the menu reports (`list`) is not what the source node's
    // metadata declares (`image`), so the seeded slot cannot be connected.
    const store = setupStore("image");
    render(<Harness store={store} />);

    const before = graphSnapshot(store);
    await user.click(screen.getByRole("button", { name: "transform output" }));

    expect(graphSnapshot(store)).toEqual(before);
    expect(screen.queryByTestId("dialog-node")).not.toBeInTheDocument();
  });

  it("restores the graph exactly when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const store = setupStore();
    store.getState().addEdge({
      id: "edge-existing",
      source: "up-1",
      sourceHandle: "output",
      target: "dst-1",
      targetHandle: "text",
      type: "default"
    });
    const before = graphSnapshot(store);
    expect(before.edges).toHaveLength(1);

    render(<Harness store={store} />);
    await user.click(screen.getByRole("button", { name: "create value" }));

    // The new node is wired in and the edge that fed the handle stepped aside.
    expect(store.getState().nodes).toHaveLength(4);
    expect(edgeShape(store.getState().edges)).toHaveLength(1);
    expect(
      store.getState().edges.some((edge) => edge.id === "edge-existing")
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Cancel generation" }));

    expect(graphSnapshot(store)).toEqual(before);
    expect(screen.queryByTestId("dialog-node")).not.toBeInTheDocument();
    expect(useCodeGenDialogStore.getState().request).toBeNull();
  });

  it("keeps the node when a submission has been applied", async () => {
    const user = userEvent.setup();
    const store = setupStore();
    render(<Harness store={store} />);

    await user.click(screen.getByRole("button", { name: "transform output" }));
    const codeNodeId = store
      .getState()
      .nodes.find((node) => node.type === CODE_NODE_TYPE)?.id as string;

    store.getState().applyCodeGenSubmission(codeNodeId, {
      title: "Count rows",
      summary: "Counts the rows.",
      code: "return { total: rows.length };",
      inputs: [{ name: "rows", type: { type: "list", type_args: [] } }],
      outputs: [{ name: "total", type: { type: "int", type_args: [] } }]
    } as codeGen.CodeGenSubmission);

    await user.click(screen.getByRole("button", { name: "Cancel generation" }));

    expect(store.getState().findNode(codeNodeId)).toBeDefined();
    expect(store.getState().edges).toHaveLength(1);
  });
});

const CollidingTrigger = () => {
  const { transformOutput } = useCodeGenFromHandle();
  return (
    <button
      type="button"
      onClick={() =>
        transformOutput({
          sourceNodeId: "src-1",
          sourceHandle: "code",
          sourceType: typeOf("str"),
          position: { x: 200, y: 0 }
        })
      }
    >
      transform code
    </button>
  );
};
