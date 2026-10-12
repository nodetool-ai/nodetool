import { renderHook } from "@testing-library/react";
import {
  makeNodeStore,
  nodeStoreWrapper
} from "../../../test-utils/nodeStore";

jest.mock("../../../stores/collapseNodeLayout", () => ({
  getCollapseTogglePatches: jest.fn((_node: unknown, collapsed: boolean) => ({
    data: { collapsed },
    node: {}
  }))
}));

import { useToggleCollapse } from "../useToggleCollapse";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import type { Node } from "@xyflow/react";
import { getCollapseTogglePatches } from "../../../stores/collapseNodeLayout";

const mockUpdateNodeData = jest.fn();
const mockUpdateNode = jest.fn();
const mockGetSelectedNodes = jest.fn();
const mockFindNode = jest.fn();

const makeNode = (id: string, collapsed = false) => ({
  id,
  data: { collapsed },
  position: { x: 0, y: 0 }
});

const renderToggleCollapse = () =>
  renderHook(() => useToggleCollapse(), {
    wrapper: nodeStoreWrapper(
      makeNodeStore(
        {
          getSelectedNodes: mockGetSelectedNodes,
          findNode: mockFindNode,
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode
        },
        { beginGroup: jest.fn(), endGroup: jest.fn() }
      )
    )
  });

describe("useToggleCollapse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindNode.mockImplementation((id: string) => makeNode(id, false));
  });

  it("collapses the given node ids", () => {
    const { result } = renderToggleCollapse();
    result.current(["a"]);

    expect(getCollapseTogglePatches).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      true
    );
    expect(mockUpdateNodeData).toHaveBeenCalledWith("a", { collapsed: true });
    expect(mockUpdateNode).toHaveBeenCalledWith("a", {});
  });

  it("drives a mixed selection to a uniform state from the first node", () => {
    // First node expanded -> whole batch collapses (next = true).
    mockFindNode.mockImplementation((id: string) =>
      makeNode(id, id === "b")
    );
    const { result } = renderToggleCollapse();
    result.current(["a", "b"]);

    expect(mockUpdateNodeData).toHaveBeenCalledTimes(2);
    expect(mockUpdateNodeData).toHaveBeenNthCalledWith(1, "a", {
      collapsed: true
    });
    expect(mockUpdateNodeData).toHaveBeenNthCalledWith(2, "b", {
      collapsed: true
    });
  });

  it("falls back to the current selection when no ids are passed", () => {
    mockGetSelectedNodes.mockReturnValue([makeNode("sel", true)]);
    const { result } = renderToggleCollapse();
    result.current();

    // Selected node is collapsed -> expands (next = false).
    expect(mockUpdateNodeData).toHaveBeenCalledWith("sel", { collapsed: false });
  });

  it("does nothing when there are no target nodes", () => {
    mockGetSelectedNodes.mockReturnValue([]);
    const { result } = renderToggleCollapse();
    result.current();
    result.current([]);

    expect(mockUpdateNodeData).not.toHaveBeenCalled();
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("ignores unknown ids that findNode cannot resolve", () => {
    mockFindNode.mockReturnValue(undefined);
    const { result } = renderToggleCollapse();
    result.current(["missing"]);

    expect(mockUpdateNodeData).not.toHaveBeenCalled();
  });

  it("collapses several nodes as one undo step", () => {
    const node = (id: string): Node<NodeData> => ({
      id,
      position: { x: 0, y: 0 },
      data: {
        properties: {},
        dynamic_properties: {},
        selectable: true,
        workflow_id: ""
      }
    });
    const store = createNodeStore(undefined, { nodes: [node("a"), node("b")] });
    const { result } = renderHook(() => useToggleCollapse(), {
      wrapper: nodeStoreWrapper(store)
    });

    result.current(["a", "b"]);

    expect(store.getState().nodes.every((n) => n.data.collapsed)).toBe(true);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });
});
