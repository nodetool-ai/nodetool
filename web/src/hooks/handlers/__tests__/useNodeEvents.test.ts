import { renderHook } from "@testing-library/react";
import { Node } from "@xyflow/react";
import { MouseEvent as ReactMouseEvent } from "react";
import { useNodeEvents } from "../useNodeEvents";
import useContextMenu from "../../../stores/ContextMenuStore";
import { useNodes } from "../../../contexts/NodeContext";
import useSelect from "../../nodes/useSelect";

jest.mock("../../../stores/ContextMenuStore");
jest.mock("../../../contexts/NodeContext");
jest.mock("../../nodes/useSelect");

describe("useNodeEvents", () => {
  const mockOpenContextMenu = jest.fn();
  const mockCloseSelect = jest.fn();
  const mockOnNodesChange = jest.fn();

  const mockedUseContextMenu = useContextMenu as unknown as jest.Mock;
  const mockedUseNodes = useNodes as unknown as jest.Mock;
  const mockedUseSelect = useSelect as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseContextMenu.mockReturnValue({
      openContextMenu: mockOpenContextMenu
    });
    mockedUseNodes.mockImplementation((selector) => {
      const state = {
        onNodesChange: mockOnNodesChange,
        edges: [],
        nodes: []
      };
      return selector(state);
    });
    mockedUseSelect.mockReturnValue({
      close: mockCloseSelect
    });
  });

  it("returns handleNodeContextMenu and handleNodesChange", () => {
    const { result } = renderHook(() => useNodeEvents());
    expect(result.current.handleNodeContextMenu).toBeDefined();
    expect(result.current.handleNodesChange).toBeDefined();
  });

  describe("handleNodeContextMenu", () => {
    it("opens context menu at event coordinates", () => {
      const { result } = renderHook(() => useNodeEvents());
      const mockEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 100,
        clientY: 200
      } as unknown as ReactMouseEvent;
      const mockNode = { id: "node-1" } as Node;

      result.current.handleNodeContextMenu(mockEvent, mockNode);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockOpenContextMenu).toHaveBeenCalledWith(
        "node-context-menu",
        "",
        100,
        200,
        "node-header"
      );
      expect(mockCloseSelect).toHaveBeenCalled();
    });

    it("handles context menu for any node", () => {
      const { result } = renderHook(() => useNodeEvents());
      const mockEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 50,
        clientY: 75
      } as unknown as ReactMouseEvent;
      const mockNode = { id: "different-node", type: "test" } as Node;

      result.current.handleNodeContextMenu(mockEvent, mockNode);

      expect(mockOpenContextMenu).toHaveBeenCalledWith(
        "node-context-menu",
        "",
        50,
        75,
        "node-header"
      );
    });
  });

  describe("handleNodesChange", () => {
    it("calls onNodesChange with the changes array", () => {
      const { result } = renderHook(() => useNodeEvents());
      const changes = [
        { type: "position", id: "node-1", position: { x: 10, y: 20 } }
      ];

      result.current.handleNodesChange(changes);

      expect(mockOnNodesChange).toHaveBeenCalledWith(changes);
    });

    it("handles empty changes array", () => {
      const { result } = renderHook(() => useNodeEvents());

      result.current.handleNodesChange([]);

      expect(mockOnNodesChange).toHaveBeenCalledWith([]);
    });

    it("passes through multiple changes", () => {
      const { result } = renderHook(() => useNodeEvents());
      const changes = [
        { type: "position", id: "node-1" },
        { type: "select", id: "node-2", selected: true },
        { type: "remove", id: "node-3" }
      ];

      result.current.handleNodesChange(changes);

      expect(mockOnNodesChange).toHaveBeenCalledWith(changes);
    });
  });
});
