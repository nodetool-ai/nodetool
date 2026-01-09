import { useCallback, useMemo, MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import useSelect from "../nodes/useSelect";

interface UsePaneEventsProps {
  pendingNodeType: string | null;
  _placementLabel: string | null;
  reactFlowInstance: ReturnType<typeof useReactFlow>;
}

const _GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";

export function usePaneEvents({ pendingNodeType, _placementLabel, reactFlowInstance }: UsePaneEventsProps) {
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
