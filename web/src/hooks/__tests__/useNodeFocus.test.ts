import { renderHook, act } from "@testing-library/react";
import { useNodeFocus } from "../useNodeFocus";
import { useNodeFocusStore } from "../../stores/NodeFocusStore";
import { useNodes } from "../../contexts/NodeContext";

jest.mock("../../contexts/NodeContext");
jest.mock("../../stores/NodeFocusStore");

describe("useNodeFocus", () => {
  const mockNodes = [
    { id: "node-1", position: { x: 100, y: 100 }, selected: false },
    { id: "node-2", position: { x: 200, y: 200 }, selected: false },
    { id: "node-3", position: { x: 300, y: 300 }, selected: false },
  ] as any;

  const mockSetNodes = jest.fn();

  const mockFocusStore = {
    focusedNodeId: null,
    isNavigationMode: false,
    focusHistory: [],
    enterNavigationMode: jest.fn(),
    exitNavigationMode: jest.fn(),
    setFocusedNode: jest.fn(),
    navigateFocus: jest.fn(),
    clearFocusHistory: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({ nodes: mockNodes, setNodes: mockSetNodes });
      }
      return { nodes: mockNodes, setNodes: mockSetNodes };
    });
    (useNodeFocusStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector(mockFocusStore);
      }
      return mockFocusStore;
    });
  });

  it("returns all focus-related functions and state", () => {
    const { result } = renderHook(() => useNodeFocus());

    expect(result.current.focusedNodeId).toBeDefined();
    expect(result.current.isNavigationMode).toBeDefined();
    expect(result.current.focusHistory).toBeDefined();
    expect(result.current.enterNavigationMode).toBeDefined();
    expect(result.current.exitNavigationMode).toBeDefined();
    expect(result.current.setFocusedNode).toBeDefined();
    expect(result.current.focusNext).toBeDefined();
    expect(result.current.focusPrev).toBeDefined();
    expect(result.current.focusUp).toBeDefined();
    expect(result.current.focusDown).toBeDefined();
    expect(result.current.focusLeft).toBeDefined();
    expect(result.current.focusRight).toBeDefined();
    expect(result.current.selectFocused).toBeDefined();
    expect(result.current.goBack).toBeDefined();
    expect(result.current.clearFocusHistory).toBeDefined();
    expect(result.current.getFocusedNode).toBeDefined();
  });

  it("calls enterNavigationMode", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.enterNavigationMode();
    });
    expect(mockFocusStore.enterNavigationMode).toHaveBeenCalled();
  });

  it("calls exitNavigationMode", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.exitNavigationMode();
    });
    expect(mockFocusStore.exitNavigationMode).toHaveBeenCalled();
  });

  it("calls setFocusedNode", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.setFocusedNode("node-1");
    });
    expect(mockFocusStore.setFocusedNode).toHaveBeenCalledWith("node-1");
  });

  it("calls navigateFocus with next direction", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.focusNext();
    });
    expect(mockFocusStore.navigateFocus).toHaveBeenCalledWith("next", mockNodes);
  });

  it("calls navigateFocus with prev direction", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.focusPrev();
    });
    expect(mockFocusStore.navigateFocus).toHaveBeenCalledWith("prev", mockNodes);
  });

  it("calls navigateFocus with up direction", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.focusUp();
    });
    expect(mockFocusStore.navigateFocus).toHaveBeenCalledWith("up", mockNodes);
  });

  it("calls navigateFocus with down direction", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.focusDown();
    });
    expect(mockFocusStore.navigateFocus).toHaveBeenCalledWith("down", mockNodes);
  });

  it("calls navigateFocus with left direction", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.focusLeft();
    });
    expect(mockFocusStore.navigateFocus).toHaveBeenCalledWith("left", mockNodes);
  });

  it("calls navigateFocus with right direction", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.focusRight();
    });
    expect(mockFocusStore.navigateFocus).toHaveBeenCalledWith("right", mockNodes);
  });

  it("selects the focused node", () => {
    (mockFocusStore as { focusedNodeId: string | null }).focusedNodeId = "node-2";

    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.selectFocused();
    });

    expect(mockSetNodes).toHaveBeenCalledWith(
      mockNodes.map((node: { id: string }) => ({
        ...node,
        selected: node.id === "node-2",
      }))
    );
  });

  it("does not update nodes when no focused node", () => {
    (mockFocusStore as { focusedNodeId: string | null }).focusedNodeId = null;

    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.selectFocused();
    });

    expect(mockSetNodes).not.toHaveBeenCalled();
  });

  it("goes back in focus history", () => {
    (mockFocusStore as { focusHistory: string[] }).focusHistory = ["node-1", "node-2", "node-3"];

    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.goBack();
    });

    expect(mockFocusStore.setFocusedNode).toHaveBeenCalledWith("node-2");
  });

  it("does nothing when history has one item", () => {
    (mockFocusStore as { focusHistory: string[] }).focusHistory = ["node-1"];

    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.goBack();
    });

    expect(mockFocusStore.setFocusedNode).not.toHaveBeenCalled();
  });

  it("does nothing when history is empty", () => {
    (mockFocusStore as { focusHistory: string[] }).focusHistory = [];

    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.goBack();
    });

    expect(mockFocusStore.setFocusedNode).not.toHaveBeenCalled();
  });

  it("clears focus history", () => {
    const { result } = renderHook(() => useNodeFocus());
    act(() => {
      result.current.clearFocusHistory();
    });
    expect(mockFocusStore.clearFocusHistory).toHaveBeenCalled();
  });

  it("returns undefined when no focused node", () => {
    (mockFocusStore as { focusedNodeId: string | null }).focusedNodeId = null;

    const { result } = renderHook(() => useNodeFocus());
    expect(result.current.getFocusedNode()).toBeUndefined();
  });

  it("returns the focused node when found", () => {
    (mockFocusStore as { focusedNodeId: string | null }).focusedNodeId = "node-2";

    const { result } = renderHook(() => useNodeFocus());
    expect(result.current.getFocusedNode()).toEqual(mockNodes[1]);
  });

  it("returns undefined when focused node not found in nodes", () => {
    (mockFocusStore as { focusedNodeId: string | null }).focusedNodeId = "non-existent";

    const { result } = renderHook(() => useNodeFocus());
    expect(result.current.getFocusedNode()).toBeUndefined();
  });

  it("returns state from store", () => {
    (mockFocusStore as { focusedNodeId: string | null }).focusedNodeId = "node-1";
    mockFocusStore.isNavigationMode = true;
    (mockFocusStore as { focusHistory: string[] }).focusHistory = ["node-1", "node-2"];

    const { result } = renderHook(() => useNodeFocus());

    expect(result.current.focusedNodeId).toBe("node-1");
    expect(result.current.isNavigationMode).toBe(true);
    expect(result.current.focusHistory).toEqual(["node-1", "node-2"]);
  });
});
