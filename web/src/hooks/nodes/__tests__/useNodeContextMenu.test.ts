const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => {
  return {
    ...jest.requireActual("react-router-dom"),
    useNavigate: () => mockNavigate
  };
});

jest.mock("../../../stores/ContextMenuStore");
jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/NotificationStore");
jest.mock("../../../stores/ResultsStore");
jest.mock("../../../stores/WorkflowRunner");
jest.mock("../../../hooks/browser/useClipboard");
jest.mock("../useRemoveFromGroup");
jest.mock("../../useDuplicate");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../../core/graph");
jest.mock("../../../utils/edgeValue");
jest.mock("../../../utils/NodeTypeMapping");

jest.mock("../../../components/properties/TextEditorModal", () => ({
  default: () => null
}));

jest.mock("../../../components/chat/containers/ChatView", () => ({
  default: () => null
}));

jest.mock("../../../components/node_types/PlaceholderNode", () => ({
  default: () => null
}));

jest.mock("lodash/debounce", () => {
  return (fn: (...args: unknown[]) => unknown) => fn;
});

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: () => ({
    getWorkflow: jest.fn(),
    createNew: jest.fn(),
    saveWorkflow: jest.fn()
  })
}));

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));

import { renderHook, act } from "@testing-library/react";
import { useNodeContextMenu } from "../useNodeContextMenu";
import useContextMenuStore from "../../../stores/ContextMenuStore";
import { useNodes } from "../../../contexts/NodeContext";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useResultsStore from "../../../stores/ResultsStore";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import { useClipboard } from "../../../hooks/browser/useClipboard";
import { useRemoveFromGroup } from "../useRemoveFromGroup";
import { useDuplicateNodes } from "../../useDuplicate";
import useMetadataStore from "../../../stores/MetadataStore";
import { subgraph } from "../../../core/graph";
import { resolveExternalEdgeValue } from "../../../utils/edgeValue";
import { constantToInputType, inputToConstantType } from "../../../utils/NodeTypeMapping";
import { useReactFlow } from "@xyflow/react";

const mockedUseContextMenuStore = useContextMenuStore as jest.Mock;
const mockedUseNodes = useNodes as jest.Mock;
const mockedUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockedUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockedUseWebsocketRunner = useWebsocketRunner as jest.Mock;
const mockedUseClipboard = useClipboard as jest.Mock;
const mockedUseRemoveFromGroup = useRemoveFromGroup as jest.Mock;
const mockedUseDuplicateNodes = useDuplicateNodes as jest.Mock;
const mockedUseMetadataStore = useMetadataStore as unknown as jest.Mock;
const mockedSubgraph = subgraph as jest.Mock;
const mockedResolveExternalEdgeValue = resolveExternalEdgeValue as jest.Mock;
const mockedConstantToInputType = constantToInputType as jest.Mock;
const mockedInputToConstantType = inputToConstantType as jest.Mock;
const mockedUseReactFlow = useReactFlow as jest.Mock;

describe("useNodeContextMenu", () => {
  const mockCloseContextMenu = jest.fn();
  const mockUpdateNodeData = jest.fn();
  const mockUpdateNode = jest.fn();
  const mockSelectNodesByType = jest.fn();
  const mockDeleteNode = jest.fn();
  const mockToggleBypass = jest.fn();
  const mockGetSelectedNodes = jest.fn<Array<{ id: string; data: Record<string, unknown> }>, []>(() => []);
  const mockSetSelectedNodes = jest.fn();
  const mockAddNotification = jest.fn();
  const mockWriteClipboard = jest.fn();
  const mockRun = jest.fn();
  const mockGetResult = jest.fn();
  const mockRemoveFromGroup = jest.fn();
  const mockGetMetadata = jest.fn();
  const mockFindNode = jest.fn();
  const mockDuplicateNode = jest.fn();
  const mockDuplicateNodeVertical = jest.fn();

  const mockNode = {
    id: "node-1",
    type: "nodetool.constant.String",
    data: {
      properties: { value: "test" },
      title: "",
      bypassed: false
    },
    parentId: null
  };

  const mockWorkflow = { id: "workflow-1", name: "Test Workflow" };
  const mockEdges = [{ source: "node-1", target: "node-2" }];
  const mockNodes = [mockNode, { id: "node-2", type: "test", data: {} }];

  beforeEach(() => {
    jest.clearAllMocks();

    mockedUseContextMenuStore.mockImplementation((selector) => {
      const state = {
        menuPosition: { x: 100, y: 200 },
        closeContextMenu: mockCloseContextMenu,
        nodeId: "node-1"
      };
      return selector(state);
    });

    mockedUseReactFlow.mockImplementation(() => ({
      getNode: jest.fn((id) => {
        const nodes = mockedUseNodes.mock.calls.flat()[1]?.()?.nodes || mockNodes;
        const node = nodes.find((n: { id: string }) => n.id === id);
        return node || null;
      }),
      getNodes: jest.fn(() => mockNodes),
      getEdges: jest.fn(() => mockEdges)
    }));

    mockedUseNodes.mockImplementation((selector) => {
      const state = {
        updateNodeData: mockUpdateNodeData,
        updateNode: mockUpdateNode,
        selectNodesByType: mockSelectNodesByType,
        deleteNode: mockDeleteNode,
        getSelectedNodes: mockGetSelectedNodes,
        toggleBypass: mockToggleBypass,
        nodes: mockNodes,
        edges: mockEdges,
        workflow: mockWorkflow,
        findNode: mockFindNode,
        setSelectedNodes: mockSetSelectedNodes
      };
      return selector(state);
    });

    mockedUseDuplicateNodes.mockImplementation((vertical: boolean) => {
      return vertical ? mockDuplicateNodeVertical : mockDuplicateNode;
    });

    mockedUseNotificationStore.mockImplementation((selector) => {
      const state = { addNotification: mockAddNotification };
      return selector(state);
    });

    mockedUseResultsStore.mockReturnValue(mockGetResult);

    mockedUseWebsocketRunner.mockImplementation((selector) => {
      const state = { run: mockRun, state: "idle" };
      return selector(state);
    });

    mockedUseClipboard.mockImplementation(() => ({
      writeClipboard: mockWriteClipboard
    }));

    mockedUseRemoveFromGroup.mockReturnValue(mockRemoveFromGroup);

    mockedUseMetadataStore.mockImplementation((selector) => {
      const state = { getMetadata: mockGetMetadata };
      return selector(state);
    });

    mockGetMetadata.mockReturnValue({ title: "String Constant" });
    mockedConstantToInputType.mockReturnValue("nodetool.input.StringInput");
    mockedInputToConstantType.mockReturnValue("nodetool.constant.String");
  });

  describe("return values", () => {
    it("returns menu state and data", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.menuPosition).toEqual({ x: 100, y: 200 });
      expect(result.current.nodeId).toBe("node-1");
      expect(result.current.closeContextMenu).toBe(mockCloseContextMenu);
      expect(result.current.node).toEqual(mockNode);
    });

    it("returns all handler functions", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.handlers).toBeDefined();
      expect(typeof result.current.handlers.handleToggleComment).toBe("function");
      expect(typeof result.current.handlers.handleRunFromHere).toBe("function");
      expect(typeof result.current.handlers.handleToggleBypass).toBe("function");
      expect(typeof result.current.handlers.handleCopyMetadataToClipboard).toBe("function");
      expect(typeof result.current.handlers.handleFindTemplates).toBe("function");
      expect(typeof result.current.handlers.handleSelectAllSameType).toBe("function");
      expect(typeof result.current.handlers.handleDeleteNode).toBe("function");
      expect(typeof result.current.handlers.handleConvertToInput).toBe("function");
      expect(typeof result.current.handlers.handleConvertToConstant).toBe("function");
      expect(typeof result.current.handlers.handleDuplicate).toBe("function");
      expect(typeof result.current.handlers.handleDuplicateVertical).toBe("function");
    });

    it("returns all condition booleans", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.conditions.hasCommentTitle).toBe(false);
      expect(result.current.conditions.isBypassed).toBe(false);
      expect(result.current.conditions.canConvertToInput).toBe(true);
      expect(result.current.conditions.canConvertToConstant).toBe(true);
      expect(result.current.conditions.isWorkflowRunning).toBe(false);
      expect(result.current.conditions.isInGroup).toBe(false);
    });
  });

  describe("handleToggleComment", () => {
    it("adds comment when hasCommentTitle is false", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleToggleComment();
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", { title: "comment" });
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });

    it("removes comment when hasCommentTitle is true", () => {
      const nodeWithComment = {
        ...mockNode,
        data: { ...mockNode.data, title: "my comment" }
      };

      mockedUseNodes.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode,
          selectNodesByType: mockSelectNodesByType,
          deleteNode: mockDeleteNode,
          getSelectedNodes: mockGetSelectedNodes,
          toggleBypass: mockToggleBypass,
          setSelectedNodes: mockSetSelectedNodes,
          nodes: [nodeWithComment, ...mockNodes.slice(1)],
          edges: mockEdges,
          workflow: mockWorkflow,
          findNode: mockFindNode
        };
        return selector(state);
      });

      mockedUseReactFlow.mockImplementation(() => ({
        getNode: jest.fn((id) => {
          const nodes = [nodeWithComment, ...mockNodes.slice(1)];
          return nodes.find((n: { id: string }) => n.id === id) || null;
        }),
        getNodes: jest.fn(() => [nodeWithComment, ...mockNodes.slice(1)]),
        getEdges: jest.fn(() => mockEdges)
      }));

      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.conditions.hasCommentTitle).toBe(true);

      act(() => {
        result.current.handlers.handleToggleComment();
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", { title: "" });
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleToggleBypass", () => {
    it("toggles bypass on the node", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleToggleBypass();
      });

      expect(mockToggleBypass).toHaveBeenCalledWith("node-1");
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleDeleteNode", () => {
    it("deletes single node when no nodes are selected", () => {
      mockGetSelectedNodes.mockReturnValue([]);

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDeleteNode();
      });

      expect(mockDeleteNode).toHaveBeenCalledWith("node-1");
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });

    it("deletes all selected nodes", () => {
      const selectedNodes: Array<{ id: string; data: Record<string, unknown> }> = [
        { id: "node-1", data: {} },
        { id: "node-2", data: {} }
      ];
      mockGetSelectedNodes.mockReturnValue(selectedNodes);

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDeleteNode();
      });

      expect(mockDeleteNode).toHaveBeenCalledWith("node-1");
      expect(mockDeleteNode).toHaveBeenCalledWith("node-2");
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleCopyMetadataToClipboard", () => {
    it("copies node data to clipboard", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleCopyMetadataToClipboard();
      });

      expect(mockWriteClipboard).toHaveBeenCalledWith(
        JSON.stringify(mockNode.data, null, 2),
        true,
        true
      );
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "info",
        alert: true,
        content: "Copied Node Data to Clipboard!"
      });
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleFindTemplates", () => {
    it("navigates to templates with node type", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleFindTemplates();
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        "/templates?node=nodetool.constant.String"
      );
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleSelectAllSameType", () => {
    it("selects all nodes of the same type", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleSelectAllSameType();
      });

      expect(mockSelectNodesByType).toHaveBeenCalledWith("nodetool.constant.String");
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleConvertToInput", () => {
    it("converts constant node to input node", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleConvertToInput();
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        properties: { value: "test", name: "string" }
      });
      expect(mockUpdateNode).toHaveBeenCalledWith("node-1", {
        type: "nodetool.input.StringInput"
      });
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "info",
        alert: false,
        content: "Converted to StringInput"
      });
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleConvertToConstant", () => {
    it("converts input node to constant node", () => {
      const inputNode = {
        ...mockNode,
        type: "nodetool.input.StringInput"
      };

      mockedUseNodes.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode,
          selectNodesByType: mockSelectNodesByType,
          deleteNode: mockDeleteNode,
          getSelectedNodes: mockGetSelectedNodes,
          toggleBypass: mockToggleBypass,
          nodes: [inputNode, ...mockNodes.slice(1)],
          edges: mockEdges,
          workflow: mockWorkflow,
          findNode: mockFindNode
        };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleConvertToConstant();
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        properties: { value: "test" }
      });
      expect(mockUpdateNode).toHaveBeenCalledWith("node-1", {
        type: "nodetool.constant.String"
      });
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "info",
        alert: false,
        content: "Converted to String"
      });
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });
  });

  describe("handleRunFromHere", () => {
    beforeEach(() => {
      mockedSubgraph.mockReturnValue({
        nodes: [mockNode],
        edges: []
      });
      mockedResolveExternalEdgeValue.mockReturnValue({
        value: "test-value",
        hasValue: true,
        isFallback: false
      });
    });

    it("runs subgraph from current node", () => {
      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleRunFromHere();
      });

      expect(mockedSubgraph).toHaveBeenCalledWith(
        mockEdges,
        mockNodes,
        mockNode
      );
      expect(mockRun).toHaveBeenCalledWith(
        {},
        mockWorkflow,
        [mockNode],
        [],
        undefined,
        new Set(["node-1"])
      );
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "info",
        alert: false,
        content: "Running workflow from String Constant"
      });
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });

    it("does not run when workflow is already running", () => {
      mockedUseWebsocketRunner.mockImplementation((selector) => {
        const state = { run: mockRun, state: "running" };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleRunFromHere();
      });

      expect(mockRun).not.toHaveBeenCalled();
    });

    it("injects external edge values into subgraph nodes", () => {
      const downstreamNode = {
        id: "downstream-1",
        type: "test",
        data: {
          properties: {},
          dynamic_properties: {}
        }
      };
      const edgeFromOutside = {
        source: "external-node",
        target: "downstream-1",
        sourceHandle: "output",
        targetHandle: "input"
      };

      mockedSubgraph.mockReturnValue({
        nodes: [mockNode, downstreamNode],
        edges: []
      });

      mockedResolveExternalEdgeValue.mockReturnValue({
        value: "injected-value",
        hasValue: true,
        isFallback: false
      });

      const allNodes = [mockNode, downstreamNode];

      mockedUseNodes.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode,
          selectNodesByType: mockSelectNodesByType,
          deleteNode: mockDeleteNode,
          getSelectedNodes: mockGetSelectedNodes,
          toggleBypass: mockToggleBypass,
          nodes: allNodes,
          edges: [edgeFromOutside],
          workflow: mockWorkflow,
          findNode: (id: string) => allNodes.find((n) => n.id === id)
        };
        return selector(state);
      });

      mockedUseReactFlow.mockImplementation(() => ({
        getNode: jest.fn((id) => allNodes.find((n) => n.id === id) || null),
        getNodes: jest.fn(() => allNodes),
        getEdges: jest.fn(() => [edgeFromOutside])
      }));

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleRunFromHere();
      });

      expect(mockRun).toHaveBeenCalled();
      const runCall = mockRun.mock.calls[0];
      const nodesPassed = runCall[2];
      const downstream = nodesPassed.find((n: { id: string }) => n.id === "downstream-1");
      expect(downstream.data.properties.input).toBe("injected-value");
    });
  });

  describe("conditions", () => {
    it("returns isInGroup as true when node has parentId", () => {
      const groupedNode = { ...mockNode, parentId: "group-1" };

      mockedUseNodes.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode,
          selectNodesByType: mockSelectNodesByType,
          deleteNode: mockDeleteNode,
          getSelectedNodes: mockGetSelectedNodes,
          toggleBypass: mockToggleBypass,
          nodes: [groupedNode, ...mockNodes.slice(1)],
          edges: mockEdges,
          workflow: mockWorkflow,
          findNode: mockFindNode
        };
        return selector(state);
      });

      mockedUseReactFlow.mockImplementation(() => ({
        getNode: jest.fn((id) => {
          if (id === "node-1") {return groupedNode;}
          return null;
        }),
        getNodes: jest.fn(() => [groupedNode, ...mockNodes.slice(1)]),
        getEdges: jest.fn(() => mockEdges)
      }));

      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.conditions.isInGroup).toBe(true);
    });

    it("returns isBypassed as true when node is bypassed", () => {
      const bypassedNode = {
        ...mockNode,
        data: { ...mockNode.data, bypassed: true }
      };

      mockedUseNodes.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode,
          selectNodesByType: mockSelectNodesByType,
          deleteNode: mockDeleteNode,
          getSelectedNodes: mockGetSelectedNodes,
          toggleBypass: mockToggleBypass,
          nodes: [bypassedNode, ...mockNodes.slice(1)],
          edges: mockEdges,
          workflow: mockWorkflow,
          findNode: mockFindNode
        };
        return selector(state);
      });

      mockedUseReactFlow.mockImplementation(() => ({
        getNode: jest.fn((id) => {
          if (id === "node-1") {return bypassedNode;}
          return null;
        }),
        getNodes: jest.fn(() => [bypassedNode, ...mockNodes.slice(1)]),
        getEdges: jest.fn(() => mockEdges)
      }));

      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.conditions.isBypassed).toBe(true);
    });

    it("returns canConvertToInput as false when node cannot be converted", () => {
      const nonConvertibleNode = {
        ...mockNode,
        type: "nodetool.llm.Chat"
      };

      mockedUseNodes.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode,
          selectNodesByType: mockSelectNodesByType,
          deleteNode: mockDeleteNode,
          getSelectedNodes: mockGetSelectedNodes,
          toggleBypass: mockToggleBypass,
          nodes: [nonConvertibleNode, ...mockNodes.slice(1)],
          edges: mockEdges,
          workflow: mockWorkflow,
          findNode: mockFindNode
        };
        return selector(state);
      });

      mockedConstantToInputType.mockReturnValue(null);

      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.conditions.canConvertToInput).toBe(false);
    });

    it("returns canConvertToConstant as false when node cannot be converted", () => {
      const nonConvertibleNode = {
        ...mockNode,
        type: "nodetool.llm.Chat"
      };

      mockedUseNodes.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          updateNode: mockUpdateNode,
          selectNodesByType: mockSelectNodesByType,
          deleteNode: mockDeleteNode,
          getSelectedNodes: mockGetSelectedNodes,
          toggleBypass: mockToggleBypass,
          nodes: [nonConvertibleNode, ...mockNodes.slice(1)],
          edges: mockEdges,
          workflow: mockWorkflow,
          findNode: mockFindNode
        };
        return selector(state);
      });

      mockedInputToConstantType.mockReturnValue(null);

      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.conditions.canConvertToConstant).toBe(false);
    });
  });

  describe("handleDuplicate", () => {
    it("selects node and duplicates horizontally when node is not selected", () => {
      mockGetSelectedNodes.mockReturnValue([]);

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDuplicate();
      });

      expect(mockSetSelectedNodes).toHaveBeenCalledWith([mockNode]);
      expect(mockDuplicateNode).toHaveBeenCalled();
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });

    it("duplicates horizontally when node is already selected", () => {
      mockGetSelectedNodes.mockReturnValue([mockNode]);

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDuplicate();
      });

      expect(mockSetSelectedNodes).not.toHaveBeenCalled();
      expect(mockDuplicateNode).toHaveBeenCalled();
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });

    it("does nothing when node is null", () => {
      mockedUseContextMenuStore.mockImplementation((selector) => {
        const state = {
          menuPosition: null,
          closeContextMenu: mockCloseContextMenu,
          nodeId: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDuplicate();
      });

      expect(mockSetSelectedNodes).not.toHaveBeenCalled();
      expect(mockDuplicateNode).not.toHaveBeenCalled();
      expect(mockCloseContextMenu).not.toHaveBeenCalled();
    });
  });

  describe("handleDuplicateVertical", () => {
    it("selects node and duplicates vertically when node is not selected", () => {
      mockGetSelectedNodes.mockReturnValue([]);

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDuplicateVertical();
      });

      expect(mockSetSelectedNodes).toHaveBeenCalledWith([mockNode]);
      expect(mockDuplicateNodeVertical).toHaveBeenCalled();
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });

    it("duplicates vertically when node is already selected", () => {
      mockGetSelectedNodes.mockReturnValue([mockNode]);

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDuplicateVertical();
      });

      expect(mockSetSelectedNodes).not.toHaveBeenCalled();
      expect(mockDuplicateNodeVertical).toHaveBeenCalled();
      expect(mockCloseContextMenu).toHaveBeenCalled();
    });

    it("does nothing when node is null", () => {
      mockedUseContextMenuStore.mockImplementation((selector) => {
        const state = {
          menuPosition: null,
          closeContextMenu: mockCloseContextMenu,
          nodeId: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeContextMenu());

      act(() => {
        result.current.handlers.handleDuplicateVertical();
      });

      expect(mockSetSelectedNodes).not.toHaveBeenCalled();
      expect(mockDuplicateNodeVertical).not.toHaveBeenCalled();
      expect(mockCloseContextMenu).not.toHaveBeenCalled();
    });
  });

  describe("null nodeId handling", () => {
    it("returns null node when no nodeId is set", () => {
      mockedUseContextMenuStore.mockImplementation((selector) => {
        const state = {
          menuPosition: null,
          closeContextMenu: mockCloseContextMenu,
          nodeId: null
        };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeContextMenu());

      expect(result.current.nodeId).toBeNull();
      expect(result.current.node).toBeNull();
    });
  });
});
