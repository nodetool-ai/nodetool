/** @jsxImportSource @emotion/react */
import { useTranslation } from "react-i18next";
import React, { useCallback, memo } from "react";
import { shallow } from "zustand/shallow";
import { ContextMenu, Divider } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
import { REROUTE_NODE_TYPE } from "../../constants/nodeTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useNodeStoreRef, useNodes } from "../../contexts/NodeContext";
import { runAsOneUndoEntry } from "../../utils/runAsOneUndoEntry";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import RouteIcon from "@mui/icons-material/Route";

interface EdgeContextMenuProps {
  edgeId?: string;
}

const EdgeContextMenuComponent: React.FC<EdgeContextMenuProps> = () => {
  const { t } = useTranslation();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const edgeId = useContextMenuStore((state) => state.nodeId); // Reusing nodeId field for edgeId

  const { deleteEdge, findEdge, createNode, addNode, addEdge } = useNodes(
    (state) => ({
      deleteEdge: state.deleteEdge,
      findEdge: state.findEdge,
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge
    }),
    shallow
  );

  const isLink = useNodes((state) =>
    state.links.some((link) => link.id === edgeId)
  );
  // A reroute forwards data, so it cannot sit on an agent's control edge.
  const isControlEdge = useNodes((state) => {
    const edge = edgeId ? state.findEdge(edgeId) : undefined;
    return edge?.type === "control" || edge?.data?.edge_type === "control";
  });
  const nodeStore = useNodeStoreRef();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const reactFlowInstance = useReactFlow();

  const handleDeleteEdge = useCallback(() => {
    if (edgeId) {
      deleteEdge(edgeId);
    }
    closeContextMenu();
  }, [edgeId, deleteEdge, closeContextMenu]);

  const handleInsertReroute = useCallback(() => {
    if (!edgeId || !menuPosition) {
      closeContextMenu();
      return;
    }

    const edge = findEdge(edgeId);
    if (!edge) {
      closeContextMenu();
      return;
    }

    const flowPosition = reactFlowInstance.screenToFlowPosition({
      x: menuPosition.x,
      y: menuPosition.y
    });

    const rerouteMetadata = getMetadata(REROUTE_NODE_TYPE);
    if (!rerouteMetadata) {
      console.error("Reroute node metadata not found");
      closeContextMenu();
      return;
    }

    const rerouteNode = createNode(rerouteMetadata, flowPosition);

    // Create new edges: source -> reroute -> target
    const sourceToReroute = {
      id: `${edge.source}-${rerouteNode.id}`,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: rerouteNode.id,
      targetHandle: "input_value"
    };

    const rerouteToTarget = {
      id: `${rerouteNode.id}-${edge.target}`,
      source: rerouteNode.id,
      sourceHandle: "output",
      target: edge.target,
      targetHandle: edge.targetHandle
    };

    // One undo step, so Ctrl+Z restores the original edge in one go.
    runAsOneUndoEntry(nodeStore, () => {
      addNode(rerouteNode);
      deleteEdge(edgeId);
      addEdge(sourceToReroute);
      addEdge(rerouteToTarget);
    });

    closeContextMenu();
  }, [
    edgeId,
    menuPosition,
    findEdge,
    createNode,
    addNode,
    addEdge,
    deleteEdge,
    getMetadata,
    reactFlowInstance,
    nodeStore,
    closeContextMenu
  ]);

  if (!menuPosition) {return null;}

  if (isLink) {
    return (
      <ContextMenu
        open={true}
        onClose={closeContextMenu}
        position={menuPosition}
        maxHeight="400px"
        minWidth="200px"
      >
        <ContextMenuItem
          onClick={handleDeleteEdge}
          IconComponent={<DeleteIcon />}
          label={t("screen_editor.deleteLink")}
          destructive
          tooltip={t("screen_editor.deleteLinkTooltip")}
        />
      </ContextMenu>
    );
  }

  return (
    <ContextMenu
      open={true}
      onClose={closeContextMenu}
      position={menuPosition}
      maxHeight="400px"
      minWidth="200px"
    >
      {!isControlEdge && (
        <ContextMenuItem
          onClick={handleInsertReroute}
          IconComponent={<RouteIcon />}
          label={t("screen_editor.insertReroute")}
          tooltip={t("screen_editor.insertRerouteTooltip")}
        />
      )}
      {!isControlEdge && <Divider />}
      <ContextMenuItem
        onClick={handleDeleteEdge}
        IconComponent={<DeleteIcon />}
        label={t("screen_editor.deleteEdge")}
        destructive
        tooltip={
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <span>{t("screen_editor.deleteConnection")}</span>
            <span style={{ textAlign: "center" }}>
              <kbd>{t("screen_editor.middleMouseButton")}</kbd> {t("screen_editor.orSelectEdgeAndPress")}{" "}
              <kbd>Delete</kbd> or <kbd>Backspace</kbd>. {t("screen_editor.selectManyEdgesByHolding")} <kbd>CTRL</kbd> {t("screen_editor.orKey")} <kbd>Meta</kbd> {t("screen_editor.whileClicking")}
            </span>
          </span>
        }
      />
    </ContextMenu>
  );
};

export default memo(EdgeContextMenuComponent);
