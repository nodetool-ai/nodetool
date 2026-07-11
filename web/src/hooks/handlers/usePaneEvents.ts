import { useCallback, MouseEvent as ReactMouseEvent, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import useSelect from "../nodes/useSelect";
import { instantiatePaletteNode } from "../../utils/instantiatePaletteNode";

interface UsePaneEventsProps {
  pendingNodeType: string | null;
  placementLabel: string | null;
  reactFlowInstance: ReturnType<typeof useReactFlow>;
}

interface UsePaneEventsResult {
  handleDoubleClick: (e: React.MouseEvent) => void;
  handlePaneClick: (event: ReactMouseEvent) => void;
  handlePaneContextMenu: (event: ReactMouseEvent | globalThis.MouseEvent) => void;
}

/**
 * Pane/canvas event handlers for the workflow editor: double-click opens the
 * node menu, click places a pending node or deselects, right-click opens the
 * context menu.
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
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const nodeActions = useMemo(
    () => ({ createNode, addNode, updateNodeData }),
    [createNode, addNode, updateNodeData]
  );

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
        const { node: newNode, afterAdd } = instantiatePaletteNode(
          metadata,
          position,
          nodeActions.createNode
        );
        newNode.selected = true;
        nodeActions.addNode(newNode);
        if (afterAdd) {
          nodeActions.updateNodeData(newNode.id, afterAdd);
        }
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
    (event: ReactMouseEvent | globalThis.MouseEvent) => {
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
