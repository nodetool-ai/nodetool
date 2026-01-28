import { renderHook } from "@testing-library/react";
import { useFitNodeEvent } from "../useFitNodeEvent";
import { useNodes } from "../../contexts/NodeContext";
import { useFitView } from "../useFitView";

jest.mock("../../contexts/NodeContext");
jest.mock("../useFitView");

describe("useFitNodeEvent", () => {
  const mockFindNode = jest.fn();
  const mockFitView = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useNodes as jest.Mock).mockImplementation((selector) => {
      const state = { findNode: mockFindNode };
      return selector(state);
    });
    (useFitView as jest.Mock).mockReturnValue(mockFitView);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("event listener registration", () => {
    it("registers event listener on mount", () => {
      const addEventListenerSpy = jest.spyOn(window, "addEventListener");

      renderHook(() => useFitNodeEvent());

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "nodetool:fit-node",
        expect.any(Function)
      );
    });

    it("removes event listener on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() => useFitNodeEvent());
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "nodetool:fit-node",
        expect.any(Function)
      );
    });
  });

  describe("event handling", () => {
    it("fits view when node is found via findNode", () => {
      const mockNode = { id: "node-1", position: { x: 100, y: 200 } };
      mockFindNode.mockReturnValue(mockNode);

      renderHook(() => useFitNodeEvent());

      const event = new CustomEvent("nodetool:fit-node", {
        detail: { nodeId: "node-1" },
      });
      window.dispatchEvent(event);

      jest.runAllTimers();

      expect(mockFindNode).toHaveBeenCalledWith("node-1");
      expect(mockFitView).toHaveBeenCalledWith({
        padding: 0.4,
        nodeIds: ["node-1"],
      });
    });

    it("fits view when node is provided in event detail", () => {
      const mockNode = { id: "node-1", position: { x: 100, y: 200 } };

      renderHook(() => useFitNodeEvent());

      const event = new CustomEvent("nodetool:fit-node", {
        detail: { nodeId: "node-1", node: mockNode },
      });
      window.dispatchEvent(event);

      jest.runAllTimers();

      expect(mockFindNode).not.toHaveBeenCalled();
      expect(mockFitView).toHaveBeenCalledWith({
        padding: 0.4,
        nodeIds: ["node-1"],
      });
    });

    it("logs error when node is not found", () => {
      mockFindNode.mockReturnValue(undefined);
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      renderHook(() => useFitNodeEvent());

      const event = new CustomEvent("nodetool:fit-node", {
        detail: { nodeId: "non-existent-node" },
      });
      window.dispatchEvent(event);

      jest.runAllTimers();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[useFitNodeEvent] node not found",
        { nodeId: "non-existent-node" }
      );
      expect(mockFitView).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("uses findNode when event node is not provided", () => {
      const mockNode = { id: "node-1" };
      mockFindNode.mockReturnValue(mockNode);

      renderHook(() => useFitNodeEvent());

      const event = new CustomEvent("nodetool:fit-node", {
        detail: { nodeId: "node-1" },
      });
      window.dispatchEvent(event);

      jest.runAllTimers();

      expect(mockFindNode).toHaveBeenCalledWith("node-1");
    });

    it("prefers event node over findNode result", () => {
      const eventNode = { id: "event-node" };
      mockFindNode.mockReturnValue({ id: "found-node" });

      renderHook(() => useFitNodeEvent());

      const event = new CustomEvent("nodetool:fit-node", {
        detail: { nodeId: "event-node", node: eventNode },
      });
      window.dispatchEvent(event);

      jest.runAllTimers();

      expect(mockFindNode).not.toHaveBeenCalled();
      expect(mockFitView).toHaveBeenCalledWith({
        padding: 0.4,
        nodeIds: ["event-node"],
      });
    });
  });

  describe("cleanup", () => {
    it("removes only the registered event listener", () => {
      const { unmount } = renderHook(() => useFitNodeEvent());

      const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "nodetool:fit-node",
        expect.any(Function)
      );
    });
  });

  describe("multiple events", () => {
    it("handles multiple fit-node events", () => {
      const mockNode1 = { id: "node-1" };
      const mockNode2 = { id: "node-2" };
      mockFindNode
        .mockReturnValueOnce(mockNode1)
        .mockReturnValueOnce(mockNode2);

      renderHook(() => useFitNodeEvent());

      const event1 = new CustomEvent("nodetool:fit-node", {
        detail: { nodeId: "node-1" },
      });
      window.dispatchEvent(event1);

      const event2 = new CustomEvent("nodetool:fit-node", {
        detail: { nodeId: "node-2" },
      });
      window.dispatchEvent(event2);

      jest.runAllTimers();

      expect(mockFitView).toHaveBeenCalledTimes(2);
    });
  });
});
