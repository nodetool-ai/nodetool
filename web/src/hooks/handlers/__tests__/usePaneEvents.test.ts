import { renderHook, act } from "@testing-library/react";
import { asMock, stub } from "../../../test-utils/doubles";
import { MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { usePaneEvents } from "../usePaneEvents";
import useNodePlacementStore from "../../../stores/NodePlacementStore";
import useContextMenu from "../../../stores/ContextMenuStore";
import { useNodes } from "../../../contexts/NodeContext";
import useMetadataStore from "../../../stores/MetadataStore";
import useSelect from "../../nodes/useSelect";

/** A drag/click target that answers `classList.contains("react-flow__pane")`. */
const paneTarget = (isPane: boolean): HTMLDivElement => {
  const el = document.createElement("div");
  if (isPane) {
    el.classList.add("react-flow__pane");
  }
  return el;
};


jest.mock("@xyflow/react");
jest.mock("../../../stores/NodePlacementStore");
jest.mock("../../../stores/ContextMenuStore");
jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../nodes/useSelect");

const mockOpenNodeMenu = jest.fn();
const mockCloseNodeMenu = jest.fn();
const mockCancelPlacement = jest.fn();
const mockOpenContextMenu = jest.fn();
const mockCloseSelect = jest.fn();
const mockGetMetadata = jest.fn();
const mockCreateNode = jest.fn().mockReturnValue({ id: "new-node", selected: false });
const mockAddNode = jest.fn();

let mockIsMenuOpen = false;

jest.mock("../../../stores/NodeMenuStore", () => {
  return {
    __esModule: true,
    default: jest.fn((selector) => {
      const mockModule = {
        openNodeMenu: mockOpenNodeMenu,
        closeNodeMenu: mockCloseNodeMenu,
        isMenuOpen: mockIsMenuOpen
      };
      if (typeof selector === 'function') {
        return selector(mockModule);
      }
      return mockModule;
    })
  };
});

describe("usePaneEvents", () => {
  const mockScreenToFlowPosition = jest.fn().mockReturnValue({ x: 100, y: 200 });
  const mockReactFlowInstance = {
    screenToFlowPosition: mockScreenToFlowPosition
  };

  const mockedUseNodePlacementStore = asMock(useNodePlacementStore);
  const mockedUseContextMenu = asMock(useContextMenu);
  const mockedUseNodes = asMock(useNodes);
  const mockedUseMetadataStore = asMock(useMetadataStore);
  const mockedUseSelect = asMock(useSelect);
  const mockedUseReactFlow = asMock(useReactFlow);

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenNodeMenu.mockClear();
    mockCloseNodeMenu.mockClear();
    mockCancelPlacement.mockClear();
    mockOpenContextMenu.mockClear();
    mockCloseSelect.mockClear();
    mockGetMetadata.mockClear();
    mockCreateNode.mockReturnValue({ id: "new-node", selected: false });
    mockAddNode.mockClear();
    mockIsMenuOpen = false;

    mockedUseNodePlacementStore.mockReturnValue(mockCancelPlacement);
    mockedUseContextMenu.mockReturnValue({
      openContextMenu: mockOpenContextMenu
    });
    mockedUseNodes.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector({
          createNode: mockCreateNode,
          addNode: mockAddNode
        });
      }
      return { createNode: mockCreateNode, addNode: mockAddNode };
    });
    mockedUseMetadataStore.mockReturnValue(mockGetMetadata);
    mockedUseSelect.mockReturnValue({
      close: mockCloseSelect
    });
    mockedUseReactFlow.mockReturnValue(mockReactFlowInstance);
  });

  it("returns handleDoubleClick, handlePaneClick, and handlePaneContextMenu", () => {
    const { result } = renderHook(() =>
      usePaneEvents({
        pendingNodeType: null,
        placementLabel: null,
        reactFlowInstance: mockReactFlowInstance as any
      })
    );
    expect(result.current.handleDoubleClick).toBeDefined();
    expect(result.current.handlePaneClick).toBeDefined();
    expect(result.current.handlePaneContextMenu).toBeDefined();
  });

  describe("handleDoubleClick", () => {
    it("opens node menu on react-flow__pane when menu is closed", () => {
      mockIsMenuOpen = false;
      const { result } = renderHook(() =>
        usePaneEvents({
          pendingNodeType: null,
          placementLabel: null,
          reactFlowInstance: mockReactFlowInstance as any
        })
      );

      const mockEvent = stub<ReactMouseEvent>({
        target: paneTarget(true),
        clientX: 150,
        clientY: 200
      });

      result.current.handleDoubleClick(mockEvent);

      expect(mockOpenNodeMenu).toHaveBeenCalledWith({ x: 150, y: 200 });
    });

    it("closes node menu when menu is already open", () => {
      mockIsMenuOpen = true;
      const { result } = renderHook(() =>
        usePaneEvents({
          pendingNodeType: null,
          placementLabel: null,
          reactFlowInstance: mockReactFlowInstance as any
        })
      );

      const mockEvent = stub<ReactMouseEvent>({
        target: paneTarget(true),
        clientX: 150,
        clientY: 200
      });

      result.current.handleDoubleClick(mockEvent);

      expect(mockCloseNodeMenu).toHaveBeenCalled();
    });

    it("closes menu when clicking on non-pane element", () => {
      mockIsMenuOpen = true;
      const { result } = renderHook(() =>
        usePaneEvents({
          pendingNodeType: null,
          placementLabel: null,
          reactFlowInstance: mockReactFlowInstance as any
        })
      );

      const mockEvent = stub<ReactMouseEvent>({
        target: paneTarget(false),
        clientX: 150,
        clientY: 200
      });

      result.current.handleDoubleClick(mockEvent);

      expect(mockCloseNodeMenu).toHaveBeenCalled();
    });
  });

  describe("handlePaneClick", () => {
    it("creates and adds node when pendingNodeType is set", () => {
      mockGetMetadata.mockReturnValue({ type: "test-node" });
      const { result } = renderHook(() =>
        usePaneEvents({
          pendingNodeType: "nodetool.test.Node",
          placementLabel: "Test Node",
          reactFlowInstance: mockReactFlowInstance as any
        })
      );

      const mockEvent = stub<ReactMouseEvent>({
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 150,
        clientY: 200
      });

      result.current.handlePaneClick(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 150, y: 200 });
      expect(mockAddNode).toHaveBeenCalled();
      expect(mockCancelPlacement).toHaveBeenCalled();
    });

    it("cancels placement and logs warning when metadata not found", () => {
      mockGetMetadata.mockReturnValue(null);
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const { result } = renderHook(() =>
        usePaneEvents({
          pendingNodeType: "nodetool.test.MissingNode",
          placementLabel: "Missing Node",
          reactFlowInstance: mockReactFlowInstance as any
        })
      );

      const mockEvent = stub<ReactMouseEvent>({
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 150,
        clientY: 200
      });

      result.current.handlePaneClick(mockEvent);

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining("Metadata not found")
      );
      expect(mockCancelPlacement).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it("closes menu and selection when clicking without pending node", () => {
      const { result } = renderHook(() =>
        usePaneEvents({
          pendingNodeType: null,
          placementLabel: null,
          reactFlowInstance: mockReactFlowInstance as any
        })
      );

      const mockEvent = stub<ReactMouseEvent>({
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 150,
        clientY: 200
      });

      result.current.handlePaneClick(mockEvent);

      expect(mockCloseSelect).toHaveBeenCalled();
    });
  });

  describe("handlePaneContextMenu", () => {
    it("opens context menu at event coordinates", async () => {
      const { result } = renderHook(() =>
        usePaneEvents({
          pendingNodeType: null,
          placementLabel: null,
          reactFlowInstance: mockReactFlowInstance as any
        })
      );

      const mockEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 300,
        clientY: 400
      } as any;

      result.current.handlePaneContextMenu(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockCloseSelect).toHaveBeenCalled();

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      });

      expect(mockOpenContextMenu).toHaveBeenCalledWith(
        "pane-context-menu",
        "",
        300,
        400,
        "react-flow__pane"
      );
    });
  });
});
