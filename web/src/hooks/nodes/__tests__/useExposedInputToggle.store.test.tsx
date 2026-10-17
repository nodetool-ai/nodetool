import React from "react";
import { act, renderHook } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import useMetadataStore from "../../../stores/MetadataStore";
import { useConfirmStore } from "../../../stores/ConfirmStore";
import { useExposedInputToggle } from "../useExposedInputToggle";

const prop = (name: string, type: string) => ({
  name,
  type: { type, optional: false, type_args: [] }
});

const metadata = {
  node_type: "test.Gen",
  namespace: "test",
  title: "Gen",
  description: "",
  layout: "default",
  outputs: [{ name: "output", type: { type: "any", optional: false, type_args: [] } }],
  properties: [prop("seed", "int"), prop("model", "image_model")],
  input_fields: [],
  inline_fields: [],
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  is_streaming_output: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false
} as unknown as NodeMetadata;

const makeNode = (id: string, data: Partial<NodeData> = {}): Node<NodeData> => ({
  id,
  type: "test.Gen",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf",
    ...data
  }
});

const edgeInto = (target: string, handle: string): Edge => ({
  id: `src-${target}-${handle}`,
  source: "src",
  sourceHandle: "output",
  target,
  targetHandle: handle
});

describe("useExposedInputToggle against a real NodeStore", () => {
  let store: NodeStore;

  beforeEach(() => {
    useMetadataStore.setState({ metadata: { "test.Gen": metadata } });
    useConfirmStore.setState({ pending: null });
    store = createNodeStore(undefined, {
      nodes: [
        makeNode("src"),
        makeNode("a", { exposedInputsLabeled: ["seed"] }),
        makeNode("b", { exposedInputsLabeled: ["seed"] })
      ],
      edges: [edgeInto("a", "seed")]
    });
    store.temporal.getState().clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderToggle = () =>
    renderHook(() => useExposedInputToggle(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <NodeProvider createStore={() => store}>{children}</NodeProvider>
      )
    });

  it("hides a connected input on several nodes as one undo step", async () => {
    const { result } = renderToggle();
    expect(store.getState().edges).toHaveLength(1);
    act(() => {
      result.current.cycleExposedInputPlacement(["a", "b"], "seed");
    });
    // The edge stays until the user answers the app confirm dialog.
    expect(store.getState().edges).toHaveLength(1);
    expect(useConfirmStore.getState().pending?.request.content).toBe(
      'Hide input for "seed"? The connected edge will be removed.'
    );
    await act(async () => useConfirmStore.getState().settle(true));

    expect(store.getState().edges).toHaveLength(0);
    expect(store.getState().findNode("a")?.data.exposedInputsLabeled).toEqual(
      []
    );
    expect(store.temporal.getState().pastStates).toHaveLength(1);

    act(() => {
      store.temporal.getState().undo();
    });
    const restored = store.getState();
    expect(restored.edges.map((e) => e.id)).toEqual(["src-a-seed"]);
    expect(restored.findNode("b")?.data.exposedInputsLabeled).toEqual(["seed"]);
  });

  it("cancelling the dialog keeps the edge and the placement", async () => {
    const confirm = jest.spyOn(window, "confirm");
    const { result } = renderToggle();
    act(() => {
      result.current.cycleExposedInputPlacement(["a", "b"], "seed");
    });
    await act(async () => useConfirmStore.getState().settle(false));

    expect(confirm).not.toHaveBeenCalled();
    expect(store.getState().edges.map((e) => e.id)).toEqual(["src-a-seed"]);
    expect(store.getState().findNode("a")?.data.exposedInputsLabeled).toEqual([
      "seed"
    ]);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it("hides an unconnected input without asking", () => {
    const { result } = renderToggle();
    act(() => {
      result.current.cycleExposedInputPlacement("b", "seed");
    });

    expect(useConfirmStore.getState().pending).toBeNull();
    expect(store.getState().findNode("b")?.data.exposedInputsLabeled).toEqual(
      []
    );
  });

  it("keeps a hidden model property hidden", () => {
    const { result } = renderToggle();
    act(() => {
      result.current.setExposedInputPlacement("a", "model", "labeled");
    });
    act(() => {
      result.current.cycleExposedInputPlacement("a", "model");
    });

    expect(store.getState().findNode("a")?.data.exposedInputsHidden).toEqual([
      "model"
    ]);
  });
});
