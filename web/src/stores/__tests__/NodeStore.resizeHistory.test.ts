jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
// The shared @xyflow/react mock stubs applyNodeChanges; these tests need the
// real change semantics (`measured` versus top-level width/height).
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual<typeof import("@xyflow/react")>(
    "../../../../node_modules/@xyflow/react/dist/umd/index.js"
  );
  return {
    ...jest.requireActual<object>("../../__mocks__/xyflowReact"),
    applyNodeChanges: actual.applyNodeChanges
  };
});

import { Node } from "@xyflow/react";
import { createNodeStore } from "../NodeStore";
import { NodeData } from "../NodeData";
import { runAsOneUndoEntry } from "../../utils/runAsOneUndoEntry";

const loadedNode = (id: string): Node<NodeData> => ({
  id,
  type: "test",
  position: { x: 0, y: 0 },
  width: 280,
  height: 200,
  style: { width: 280, height: 200 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: ""
  }
});

describe("NodeStore resize history", () => {
  test("measuring a loaded node records no undo step and stays clean", () => {
    const store = createNodeStore(undefined, { nodes: [loadedNode("a")] });

    store.getState().onNodesChange([
      { id: "a", type: "dimensions", dimensions: { width: 280, height: 173 } }
    ]);

    expect(store.getState().nodes[0].measured).toEqual({
      width: 280,
      height: 173
    });
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    expect(store.getState().workflowIsDirty).toBe(false);
  });

  test("a resize gesture is one undo step that restores the size", () => {
    const store = createNodeStore(undefined, { nodes: [loadedNode("a")] });

    runAsOneUndoEntry(store, () => {
      for (const width of [300, 340, 380]) {
        store.getState().onNodesChange([
          {
            id: "a",
            type: "dimensions",
            resizing: true,
            setAttributes: "width",
            dimensions: { width, height: 200 }
          }
        ]);
      }
    });

    expect(store.getState().nodes[0].width).toBe(380);
    expect(store.temporal.getState().pastStates).toHaveLength(1);

    store.temporal.getState().undo();
    expect(store.getState().nodes[0].width).toBe(280);
  });

  test("a measurement reset records no undo step", () => {
    const store = createNodeStore(undefined, { nodes: [loadedNode("a")] });

    store.getState().updateNode("a", { height: undefined, measured: undefined });

    expect(store.getState().nodes[0].height).toBeUndefined();
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    expect(store.temporal.getState().isTracking).toBe(true);
  });
});
