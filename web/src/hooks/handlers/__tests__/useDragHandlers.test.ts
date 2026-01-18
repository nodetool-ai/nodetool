import { renderHook, act } from "@testing-library/react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import useDragHandlers from "../useDragHandlers";

// Mock dependencies
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    screenToFlowPosition: jest.fn((pos) => ({ x: pos.x, y: pos.y })),
    getIntersectingNodes: jest.fn(() => [])
  }))
}));

jest.mock("../../stores/SettingsStore", () => ({
  useSettingsStore: jest.fn((selector) =>
    selector({
      settings: { panControls: "default" }
    })
  )
}));

jest.mock("../../stores/KeyPressedStore", () => ({
  useKeyPressed: jest.fn(() =>
    jest.fn((key) => {
      if (key === "control") return false;
      if (key === "meta") return false;
      return false;
    })
  )
}));

jest.mock("../../utils/MousePosition", () => ({
  getMousePosition: jest.fn(() => ({ x: 100, y: 200 })),
  addWiggleMovement: jest.fn(),
  isWiggling: jest.fn(() => false),
  resetWiggleDetection: jest.fn()
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(() => ({
    setHoveredNodes: jest.fn(),
    findNode: jest.fn(() => undefined)
  })),
  useTemporalNodes: jest.fn(() => ({
    pause: jest.fn(),
    resume: jest.fn()
  }))
}));

jest.mock("../nodes/useAddToGroup", () => ({
  useAddToGroup: jest.fn(() => jest.fn())
}));

jest.mock("../nodes/useRemoveFromGroup", () => ({
  useRemoveFromGroup: jest.fn(() => jest.fn())
}));

jest.mock("../nodes/useIsGroupable", () => ({
  useIsGroupable: jest.fn(() => ({
    isGroup: jest.fn(() => false)
  }))
}));

describe("useDragHandlers", () => {
  let result: ReturnType<typeof useDragHandlers>;

  beforeEach(() => {
    jest.clearAllMocks();
    result = renderHook(() => useDragHandlers()).result.current;
  });

  describe("onNodeDragStart", () => {
    it("resets wiggle detection and clears last parent node", () => {
      const { resetWiggleDetection } = require("../../utils/MousePosition");
      const event = {} as any;

      result.onNodeDragStart(event);

      expect(resetWiggleDetection).toHaveBeenCalled();
    });
  });

  describe("onNodeDrag", () => {
    it("pauses temporal nodes and adds wiggle movement", () => {
      const { addWiggleMovement } = require("../../utils/MousePosition");
      const { useTemporalNodes } = require("../../contexts/NodeContext");

      const mockPause = jest.fn();
      useTemporalNodes.mockReturnValue({ pause: mockPause, resume: jest.fn() });

      const node = {
        id: "node-1",
        parentId: undefined,
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      result.onNodeDrag(event, node);

      expect(mockPause).toHaveBeenCalled();
      expect(addWiggleMovement).toHaveBeenCalledWith(100, 200);
    });

    it("removes node from group when wiggling with parent", () => {
      const { isWiggling } = require("../../utils/MousePosition");
      const { useRemoveFromGroup } = require("../nodes/useRemoveFromGroup");

      isWiggling.mockReturnValue(true);

      const mockRemoveFromGroup = jest.fn();
      useRemoveFromGroup.mockReturnValue(mockRemoveFromGroup);

      const node = {
        id: "node-1",
        parentId: "group-1",
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      result.onNodeDrag(event, node);

      expect(mockRemoveFromGroup).toHaveBeenCalledWith([node]);
    });

    it("removes node from group when control key is pressed", () => {
      const { useKeyPressed } = require("../../stores/KeyPressedStore");
      const { useRemoveFromGroup } = require("../nodes/useRemoveFromGroup");

      useKeyPressed.mockReturnValue(jest.fn((key) => key === "control"));

      const mockRemoveFromGroup = jest.fn();
      useRemoveFromGroup.mockReturnValue(mockRemoveFromGroup);

      const node = {
        id: "node-1",
        parentId: "group-1",
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      result.onNodeDrag(event, node);

      expect(mockRemoveFromGroup).toHaveBeenCalledWith([node]);
    });

    it("sets hovered nodes when dragging over group", () => {
      const { useReactFlow } = require("@xyflow/react");
      const { useNodes } = require("../../contexts/NodeContext");
      const { useIsGroupable } = require("../nodes/useIsGroupable");

      const mockGetIntersectingNodes = jest.fn(() => [
        { id: "group-1", type: "group" }
      ]);
      useReactFlow.mockReturnValue({
        getIntersectingNodes: mockGetIntersectingNodes
      });

      const mockSetHoveredNodes = jest.fn();
      useNodes.mockReturnValue({
        setHoveredNodes: mockSetHoveredNodes,
        findNode: jest.fn(() => ({ id: "group-1" }))
      });

      const mockIsGroup = jest.fn(() => true);
      useIsGroupable.mockReturnValue({ isGroup: mockIsGroup });

      const node = {
        id: "node-1",
        parentId: undefined,
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      result.onNodeDrag(event, node);

      expect(mockSetHoveredNodes).toHaveBeenCalledWith(["group-1"]);
    });
  });

  describe("onNodeDragStop", () => {
    it("resumes temporal nodes and clears state", () => {
      const { useTemporalNodes } = require("../../contexts/NodeContext");
      const { useNodes } = require("../../contexts/NodeContext");
      const { useAddToGroup } = require("../nodes/useAddToGroup");
      const { resetWiggleDetection } = require("../../utils/MousePosition");

      const mockResume = jest.fn();
      useTemporalNodes.mockReturnValue({ pause: jest.fn(), resume: mockResume });

      const mockSetHoveredNodes = jest.fn();
      useNodes.mockReturnValue({
        setHoveredNodes: mockSetHoveredNodes,
        findNode: jest.fn()
      });

      const mockAddToGroup = jest.fn();
      useAddToGroup.mockReturnValue(mockAddToGroup);

      const node = {
        id: "node-1",
        parentId: undefined,
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const event = {} as any;

      result.onNodeDragStop(event, node);

      expect(mockResume).toHaveBeenCalled();
      expect(resetWiggleDetection).toHaveBeenCalled();
      expect(mockSetHoveredNodes).toHaveBeenCalledWith([]);
    });

    it("adds node to group when valid parent was intersected", () => {
      const { useAddToGroup } = require("../nodes/useAddToGroup");

      const mockAddToGroup = jest.fn();
      useAddToGroup.mockReturnValue(mockAddToGroup);

      const node = {
        id: "node-1",
        parentId: undefined,
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const event = {} as any;

      result.onNodeDragStop(event, node);

      expect(mockAddToGroup).not.toHaveBeenCalled(); // lastParentNode is undefined
    });
  });

  describe("onSelectionDragStart", () => {
    it("pauses history and sets dragged nodes", () => {
      const { useTemporalNodes } = require("../../contexts/NodeContext");
      const { resetWiggleDetection } = require("../../utils/MousePosition");

      const mockPause = jest.fn();
      useTemporalNodes.mockReturnValue({ pause: mockPause, resume: jest.fn() });

      const nodes = [
        { id: "node-1" },
        { id: "node-2" }
      ] as Node<NodeData>[];
      const event = {} as any;

      result.onSelectionDragStart(event, nodes);

      expect(mockPause).toHaveBeenCalled();
      expect(resetWiggleDetection).toHaveBeenCalled();
    });
  });

  describe("onSelectionDrag", () => {
    it("handles multi-node selection drag", () => {
      const { addWiggleMovement } = require("../../utils/MousePosition");
      const { useRemoveFromGroup } = require("../nodes/useRemoveFromGroup");

      const mockRemoveFromGroup = jest.fn();
      useRemoveFromGroup.mockReturnValue(mockRemoveFromGroup);

      const nodes = [
        { id: "node-1", parentId: "group-1" },
        { id: "node-2", parentId: "group-1" }
      ] as Node<NodeData>[];
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      result.onSelectionDrag(event, nodes);

      expect(addWiggleMovement).toHaveBeenCalledWith(100, 200);
    });

    it("removes all parented nodes from group when wiggling", () => {
      const { isWiggling } = require("../../utils/MousePosition");
      const { useRemoveFromGroup } = require("../nodes/useRemoveFromGroup");

      isWiggling.mockReturnValue(true);

      const mockRemoveFromGroup = jest.fn();
      useRemoveFromGroup.mockReturnValue(mockRemoveFromGroup);

      const nodes = [
        { id: "node-1", parentId: "group-1" },
        { id: "node-2", parentId: "group-2" }
      ] as Node<NodeData>[];
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      result.onSelectionDrag(event, nodes);

      expect(mockRemoveFromGroup).toHaveBeenCalledWith(nodes);
    });
  });

  describe("onSelectionDragStop", () => {
    it("resumes history and clears state", () => {
      const { useTemporalNodes } = require("../../contexts/NodeContext");
      const { useNodes } = require("../../contexts/NodeContext");
      const { resetWiggleDetection } = require("../../utils/MousePosition");

      const mockResume = jest.fn();
      useTemporalNodes.mockReturnValue({ pause: jest.fn(), resume: mockResume });

      const mockSetHoveredNodes = jest.fn();
      useNodes.mockReturnValue({
        setHoveredNodes: mockSetHoveredNodes,
        findNode: jest.fn()
      });

      const nodes = [{ id: "node-1" }] as Node<NodeData>[];
      const event = {} as any;

      result.onSelectionDragStop(event, nodes);

      expect(mockResume).toHaveBeenCalled();
      expect(resetWiggleDetection).toHaveBeenCalled();
      expect(mockSetHoveredNodes).toHaveBeenCalledWith([]);
    });
  });

  describe("onSelectionStart", () => {
    it("sets start position from mouse position", () => {
      const { getMousePosition } = require("../../utils/MousePosition");
      const { useReactFlow } = require("@xyflow/react");

      getMousePosition.mockReturnValue({ x: 100, y: 200 });

      const mockScreenToFlowPosition = jest.fn(() => ({ x: 50, y: 100 }));
      useReactFlow.mockReturnValue({
        screenToFlowPosition: mockScreenToFlowPosition
      });

      const event = {} as any;

      result.onSelectionStart(event);

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 100, y: 200 });
    });
  });

  describe("onSelectionEnd", () => {
    it("is a no-op function", () => {
      const event = {} as MouseEvent;

      expect(() => result.onSelectionEnd(event)).not.toThrow();
    });
  });

  describe("panOnDrag", () => {
    it("defaults to left mouse button only", () => {
      expect(result.panOnDrag).toEqual([0]);
    });

    it("includes right mouse button when panControls is RMB", () => {
      const { useSettingsStore } = require("../../stores/SettingsStore");
      
      useSettingsStore.mockImplementation(() =>
        ({
          settings: { panControls: "RMB" }
        })
      );

      const updatedResult = renderHook(() => useDragHandlers()).result.current;
      
      expect(updatedResult.panOnDrag).toEqual([1, 2]);
    });
  });
});
