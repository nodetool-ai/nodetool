import { renderHook, act } from "@testing-library/react";
import { useFocusPan } from "../useFocusPan";

const mockSetCenter = jest.fn();
const mockGetViewport = jest.fn(() => ({ zoom: 1 }));

jest.mock("@xyflow/react", () => {
  const mockUseReactFlow = jest.fn();
  return {
    useReactFlow: mockUseReactFlow
  };
});

jest.mock("../../contexts/NodeContext", () => {
  const mockUseNodes = jest.fn();
  return {
    useNodes: mockUseNodes
  };
});

import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";

describe("useFocusPan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetCenter.mockReset();
    mockGetViewport.mockReturnValue({ zoom: 1 });
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        findNode: jest.fn((id) => ({
          id,
          position: { x: 100, y: 200 },
          data: {}
        }))
      })
    );
    (useReactFlow as unknown as jest.Mock).mockReturnValue({
      getViewport: mockGetViewport,
      setCenter: mockSetCenter
    });
  });

  it("returns a callback function", () => {
    const { result } = renderHook(() => useFocusPan("node-1"));

    expect(typeof result.current).toBe("function");
  });

  it("does not pan when Tab was not pressed", () => {
    const { result } = renderHook(() => useFocusPan("node-1"));

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(mockSetCenter).not.toHaveBeenCalled();
  });

  it("pans to node when Tab was pressed", () => {
    const { result } = renderHook(() => useFocusPan("node-1"));

    act(() => {
      const keydownEvent = new KeyboardEvent("keydown", { key: "Tab" });
      window.dispatchEvent(keydownEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(mockSetCenter).toHaveBeenCalledWith(100, 200, {
      duration: 200,
      zoom: 1
    });
  });

  it("does not pan when node is not found", () => {
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        findNode: jest.fn(() => null)
      })
    );

    const { result } = renderHook(() => useFocusPan("nonexistent-node"));

    act(() => {
      const keydownEvent = new KeyboardEvent("keydown", { key: "Tab" });
      window.dispatchEvent(keydownEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(mockSetCenter).not.toHaveBeenCalled();
  });

  it("uses current zoom level from viewport", () => {
    mockGetViewport.mockReturnValue({ zoom: 0.5 });

    const { result } = renderHook(() => useFocusPan("node-1"));

    act(() => {
      const keydownEvent = new KeyboardEvent("keydown", { key: "Tab" });
      window.dispatchEvent(keydownEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(mockSetCenter).toHaveBeenCalledWith(100, 200, {
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

    act(() => {
      const keyupEvent = new KeyboardEvent("keyup", { key: "Tab" });
      window.dispatchEvent(keyupEvent);
    });

    act(() => {
      result.current({} as React.FocusEvent<HTMLElement>);
    });

    expect(mockSetCenter).not.toHaveBeenCalled();
  });
});
