import React from "react";
import { act, renderHook } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import { useDynamicProperty } from "../useDynamicProperty";

const makeNode = (
  id: string,
  dynamic_properties: Record<string, unknown> = {}
): Node<NodeData> => ({
  id,
  type: "test.Format",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties,
    workflow_id: "wf"
  }
});

const edgeInto = (source: string, handle: string): Edge => ({
  id: `${source}-${handle}`,
  source,
  sourceHandle: "output",
  target: "fmt",
  targetHandle: handle
});

describe("useDynamicProperty against a real NodeStore", () => {
  let store: NodeStore;

  beforeEach(() => {
    store = createNodeStore(undefined, {
      nodes: [
        makeNode("src"),
        makeNode("other"),
        makeNode("fmt", { x: "", y: "" })
      ],
      edges: [edgeInto("src", "x"), edgeInto("other", "y")]
    });
    store.temporal.getState().clear();
  });

  const renderSlots = () =>
    renderHook(
      () =>
        useDynamicProperty(
          "fmt",
          store.getState().findNode("fmt")?.data.dynamic_properties ?? {}
        ),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NodeProvider createStore={() => store}>{children}</NodeProvider>
        )
      }
    );

  it("deletes the edges into a removed input in the same undo step", () => {
    const { result } = renderSlots();
    act(() => {
      result.current.handleDeleteProperty("x");
    });

    const state = store.getState();
    expect(Object.keys(state.findNode("fmt")?.data.dynamic_properties ?? {}))
      .toEqual(["y"]);
    expect(state.edges.map((e) => e.id)).toEqual(["other-y"]);
    expect(store.temporal.getState().pastStates).toHaveLength(1);

    act(() => {
      store.temporal.getState().undo();
    });
    const restored = store.getState();
    expect(
      Object.keys(restored.findNode("fmt")?.data.dynamic_properties ?? {})
    ).toEqual(["x", "y"]);
    expect(restored.edges.map((e) => e.id)).toEqual(["src-x", "other-y"]);
  });

  it("rejects renaming an input onto a name that is already taken", () => {
    const { result } = renderSlots();
    const before = store.getState();
    act(() => {
      result.current.handleUpdatePropertyName("y", "x");
    });

    const after = store.getState();
    expect(after.nodes).toBe(before.nodes);
    expect(after.edges).toBe(before.edges);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it("renames an input and moves its edge in one undo step", () => {
    const { result } = renderSlots();
    act(() => {
      result.current.handleUpdatePropertyName("y", "z");
    });

    const state = store.getState();
    expect(Object.keys(state.findNode("fmt")?.data.dynamic_properties ?? {}))
      .toEqual(["x", "z"]);
    expect(state.edges.find((e) => e.id === "other-y")?.targetHandle).toBe(
      "z"
    );
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });
});
