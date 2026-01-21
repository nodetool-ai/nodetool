import { describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn().mockReturnValue({
    fitView: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    getNodes: jest.fn().mockReturnValue([]),
    getEdges: jest.fn().mockReturnValue([]),
    screenToFlowPosition: jest.fn().mockReturnValue({ x: 100, y: 200 }),
    setNodes: jest.fn(),
    setEdges: jest.fn(),
  }),
}));

jest.mock("../../stores/KeyPressedStore", () => ({
  useKeyPressedStore: {
    getState: jest.fn().mockReturnValue({
      isPressed: jest.fn().mockReturnValue(false),
      setPressed: jest.fn(),
      setReleased: jest.fn(),
    }),
    subscribe: jest.fn(),
  },
}));

jest.mock("../../stores/NodeStore", () => ({
  useNodeStore: jest.fn().mockReturnValue({
    nodes: [],
    selectedNodes: [],
    getSelectedNodes: jest.fn().mockReturnValue([]),
    addNode: jest.fn(),
    updateNode: jest.fn(),
    deleteNode: jest.fn(),
    duplicateNodes: jest.fn().mockReturnValue([]),
    setNodes: jest.fn(),
    selectNodesByType: jest.fn(),
    setSelectedNodes: jest.fn(),
    selectAllNodes: jest.fn(),
    createNode: jest.fn().mockReturnValue({ id: "new-node-1" }),
  }),
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector?: any) => {
    const mockState = {
      nodes: [],
      selectedNodes: [],
      getSelectedNodes: jest.fn().mockReturnValue([]),
      addNode: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      duplicateNodes: jest.fn().mockReturnValue([]),
      setNodes: jest.fn(),
      selectNodesByType: jest.fn(),
      setSelectedNodes: jest.fn(),
      selectAllNodes: jest.fn(),
      createNode: jest.fn().mockReturnValue({ id: "new-node-1" }),
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  }),
  useTemporalNodes: jest.fn().mockReturnValue({
    temporal: {
      undo: jest.fn(),
      redo: jest.fn(),
    },
  }),
}));

jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: {
    getState: jest.fn().mockReturnValue({
      addNotification: jest.fn(),
    }),
  },
}));

jest.mock("../../stores/RightPanelStore", () => ({
  useRightPanelStore: {
    getState: jest.fn().mockReturnValue({
      setInspectNode: jest.fn(),
    }),
  },
}));

jest.mock("../../stores/NodeMenuStore", () => ({
  useNodeMenuStore: {
    getState: jest.fn().mockReturnValue({
      openMenu: jest.fn(),
    }),
  },
}));

jest.mock("../../stores/SessionStateStore", () => ({
  useSessionStateStore: {
    getState: jest.fn().mockReturnValue({
      getClipboardData: jest.fn().mockReturnValue(null),
      setClipboardData: jest.fn(),
    }),
  },
}));

describe("useNodeEditorShortcuts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("module import", () => {
    it("should export useNodeEditorShortcuts hook", () => {
      const { useNodeEditorShortcuts } = require("../useNodeEditorShortcuts");
      expect(useNodeEditorShortcuts).toBeDefined();
      expect(typeof useNodeEditorShortcuts).toBe("function");
    });
  });
});
