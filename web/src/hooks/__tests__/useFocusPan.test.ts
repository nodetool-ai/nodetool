import { renderHook } from "@testing-library/react";
import { useFocusPan } from "../useFocusPan";
import { useReactFlow } from "@xyflow/react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

import { useNodes } from "../../contexts/NodeContext";

describe("useFocusPan", () => {
  const mockNode: Node<NodeData> = {
    id: "node-1",
    type: "test",
    position: { x: 100, y: 200 },
    targetPosition: "Left" as any,
    sourcePosition: "Right" as any,
    data: {
      properties: {},
      dynamic_properties: {},
      selectable: true,
      workflow_id: "test"
    }
  };

  const mockFindNode = jest.fn();
  const mockSetCenter = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    (useNodes as jest.Mock).mockImplementation(() => ({
      findNode: mockFindNode
    }));

    (useReactFlow as jest.Mock).mockImplementation(() => ({
      getViewport: jest.fn().mockReturnValue({ zoom: 1 }),
      setCenter: mockSetCenter
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initialization", () => {
    it("returns a callback function", () => {
      const { result } = renderHook(() => useFocusPan("node-1"));
      expect(typeof result.current).toBe("function");
    });

    it("sets up keyboard event listeners", () => {
      const addEventListenerSpy = jest.spyOn(window, "addEventListener");
      
      renderHook(() => useFocusPan("node-1"));
      
      expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith("keyup", expect.any(Function));
    });

    it("cleans up keyboard event listeners on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");
      
      const { unmount } = renderHook(() => useFocusPan("node-1"));
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith("keyup", expect.any(Function));
    });
  });

  describe("Tab key tracking", () => {
    it("does not trigger pan for non-Tab key presses", () => {
      mockFindNode.mockReturnValue(mockNode);
      
      const { result } = renderHook(() => useFocusPan("node-1"));
      
      const focusEvent = { preventDefault: jest.fn() };
      result.current(focusEvent as any);
      
      expect(mockSetCenter).not.toHaveBeenCalled();
    });
  });
});
