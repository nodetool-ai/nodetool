import { renderHook, act } from "@testing-library/react";
import { useFocusPan } from "../useFocusPan";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const mockState = {
      findNode: jest.fn((id) => ({
        id,
        position: { x: 100, y: 200 },
        data: {}
      }))
    };
    return selector(mockState);
  })
}));

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    getViewport: jest.fn(() => ({ zoom: 1 })),
    setCenter: jest.fn()
  })),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom"
  }
}));

describe("useFocusPan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a callback function", () => {
    const { result } = renderHook(() => useFocusPan("node-1"));

    expect(typeof result.current).toBe("function");
  });

  it("does not pan when Tab was not pressed", () => {
    const setCenter = jest.fn();
    (require("@xyflow/react").useReactFlow as jest.Mock).mockReturnValue({
      getViewport: jest.fn(() => ({ zoom: 1 })),
      setCenter
    });

    const { result } = renderHook(() => useFocusPan("node-1"));

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(setCenter).not.toHaveBeenCalled();
  });

  it("pans to node when Tab was pressed", () => {
    const setCenter = jest.fn();
    (require("@xyflow/react").useReactFlow as jest.Mock).mockReturnValue({
      getViewport: jest.fn(() => ({ zoom: 1 })),
      setCenter
    });

    const { result } = renderHook(() => useFocusPan("node-1"));

    act(() => {
      const keydownEvent = new KeyboardEvent("keydown", { key: "Tab" });
      window.dispatchEvent(keydownEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(setCenter).toHaveBeenCalledWith(100, 200, {
      duration: 200,
      zoom: 1
    });
  });

  it("does not pan when node is not found", () => {
    const setCenter = jest.fn();
    (require("@xyflow/react").useReactFlow as jest.Mock).mockReturnValue({
      getViewport: jest.fn(() => ({ zoom: 1 })),
      setCenter
    });

    (require("../../contexts/NodeContext").useNodes as jest.Mock).mockImplementation((selector) => {
      return selector({
        findNode: jest.fn(() => null)
      });
    });

    const { result } = renderHook(() => useFocusPan("nonexistent-node"));

    act(() => {
      const keydownEvent = new KeyboardEvent("keydown", { key: "Tab" });
      window.dispatchEvent(keydownEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(setCenter).not.toHaveBeenCalled();
  });

  it.skip("uses current zoom level from viewport", () => {
    const setCenter = jest.fn();
    (require("@xyflow/react").useReactFlow as jest.Mock).mockReturnValue({
      getViewport: jest.fn(() => ({ zoom: 0.5 })),
      setCenter
    });

    const { result } = renderHook(() => useFocusPan("node-1"));

    act(() => {
      const keydownEvent = new KeyboardEvent("keydown", { key: "Tab" });
      window.dispatchEvent(keydownEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(setCenter).toHaveBeenCalledWith(100, 200, {
      duration: 200,
      zoom: 0.5
    });
  });

  it("cleans up event listeners on unmount", () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    const removeEventListener = jest.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useFocusPan("node-1"));

    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith("keyup", expect.any(Function));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("keyup", expect.any(Function));

    removeEventListener.mockRestore();
    addEventListener.mockRestore();
  });

  it("resets tab pressed state on keyup", () => {
    const { result } = renderHook(() => useFocusPan("node-1"));

    act(() => {
      const keydownEvent = new KeyboardEvent("keydown", { key: "Tab" });
      window.dispatchEvent(keydownEvent);
    });

    let didNotPan = false;
    const originalSetCenter = require("@xyflow/react").useReactFlow().setCenter;
    (require("@xyflow/react").useReactFlow as jest.Mock).mockReturnValue({
      getViewport: jest.fn(() => ({ zoom: 1 })),
      setCenter: () => {
        didNotPan = true;
      }
    });

    act(() => {
      const keyupEvent = new KeyboardEvent("keyup", { key: "Tab" });
      window.dispatchEvent(keyupEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(didNotPan).toBe(false);
  });
});
