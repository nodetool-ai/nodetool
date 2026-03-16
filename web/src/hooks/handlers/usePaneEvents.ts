import { useCallback, MouseEvent as ReactMouseEvent, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import useSelect from "../nodes/useSelect";

/**
 * Configuration options for usePaneEvents hook.
 */
interface UsePaneEventsProps {
  /** The type of node pending placement (from node menu) */
  pendingNodeType: string | null;
  /** The label for the node being placed */
  placementLabel: string | null;
  /** The ReactFlow instance for coordinate conversion */
  reactFlowInstance: ReturnType<typeof useReactFlow>;
}

/**
 * Result object containing pane event handlers.
 */
interface UsePaneEventsResult {
  /** Handler for double-clicking on the canvas */
  handleDoubleClick: (e: React.MouseEvent) => void;
  /** Handler for clicking on the canvas */
  handlePaneClick: (event: ReactMouseEvent) => void;
  /** Handler for right-clicking on the canvas */
  handlePaneContextMenu: (event: any) => void;
}

/**
 * Hook for handling pane/canvas events in the workflow editor.
 * 
 * Manages interactions with the ReactFlow canvas including:
 * - Double-click to open node menu
 * - Click to place pending nodes or deselect
 * - Right-click to open context menu
 * 
 * @param props - Configuration including pending node type and ReactFlow instance
 * @returns Object containing pane event handlers
 * 
 * @example
 * ```typescript
 * const { handlePaneClick, handleDoubleClick, handlePaneContextMenu } = usePaneEvents({
 *   pendingNodeType,
 *   placementLabel,
 *   reactFlowInstance,
 * });
 * 
 * return <ReactFlow onPaneClick={handlePaneClick} onPaneContextMenu={handlePaneContextMenu} />;
 * ```
 */
export function usePaneEvents({ pendingNodeType, placementLabel: _placementLabel, reactFlowInstance }: UsePaneEventsProps): UsePaneEventsResult {
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);
  const isMenuOpen = useNodeMenuStore((state) => state.isMenuOpen);
  const cancelPlacement = useNodePlacementStore((state) => state.cancelPlacement);

  const { openContextMenu } = useContextMenu();
  const { close: closeSelect } = useSelect();

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const createNode = useNodes((state) => state.createNode);
  const addNode = useNodes((state) => state.addNode);

  const nodeActions = useMemo(() => ({ createNode, addNode }), [createNode, addNode]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("react-flow__pane")) {
        if (isMenuOpen) {
          closeNodeMenu();
        } else {
          openNodeMenu({
            x: e.clientX,
            y: e.clientY
          });
        }
      } else {
        closeNodeMenu();
      }
    },
    [closeNodeMenu, isMenuOpen, openNodeMenu]
  );

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (pendingNodeType) {
        event.preventDefault();
        event.stopPropagation();
        const metadata = getMetadata(pendingNodeType);
        if (!metadata) {
          console.warn(
            `Metadata not found while placing node type: ${pendingNodeType}`
          );
          cancelPlacement();
          return;
        }
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        });
        const newNode = nodeActions.createNode(metadata, position);
        newNode.selected = true;
        nodeActions.addNode(newNode);
        cancelPlacement();
        if (isMenuOpen) {
          closeNodeMenu();
        }
        closeSelect();
        return;
      }

      if (isMenuOpen) {
        closeNodeMenu();
      }
      closeSelect();
    },
    [
      pendingNodeType,
      getMetadata,
      reactFlowInstance,
      nodeActions,
      cancelPlacement,
      isMenuOpen,
      closeNodeMenu,
      closeSelect
    ]
  );

  const handlePaneContextMenu = useCallback(
    (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => {
        openContextMenu(
          "pane-context-menu",
          "",
          event.clientX,
          event.clientY,
          "react-flow__pane"
        );
      });
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  return {
    handleDoubleClick,
    handlePaneClick,
    handlePaneContextMenu
  };
}
