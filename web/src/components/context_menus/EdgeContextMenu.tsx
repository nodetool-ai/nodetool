/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import DeleteIcon from "@mui/icons-material/Delete";
import RouteIcon from "@mui/icons-material/Route";

interface EdgeContextMenuProps {
  edgeId?: string;
}

const EdgeContextMenu: React.FC<EdgeContextMenuProps> = () => {
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
    })
  );

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const reactFlowInstance = useReactFlow();

  const handleDeleteEdge = useCallback(() => {
    if (edgeId) {
      deleteEdge(edgeId);
    }
    closeContextMenu();
  }, [edgeId, deleteEdge, closeContextMenu]);

  const handleInsertReroute = useCallback(() => {
    console.log("Insert Reroute clicked", { edgeId, menuPosition });

    if (!edgeId || !menuPosition) {
      console.log("Missing edgeId or menuPosition", { edgeId, menuPosition });
      closeContextMenu();
      return;
    }

    const edge = findEdge(edgeId);
    if (!edge) {
      console.log("Edge not found", edgeId);
      closeContextMenu();
      return;
    }

    console.log("Found edge", edge);

    // Convert screen coordinates to flow coordinates
    const flowPosition = reactFlowInstance.screenToFlowPosition({
      x: menuPosition.x,
      y: menuPosition.y
    });

    // Get metadata for the Reroute node
    const rerouteMetadata = getMetadata("nodetool.control.Reroute");
    if (!rerouteMetadata) {
      console.error("Reroute node metadata not found");
      closeContextMenu();
      return;
    }

    // Create a new Reroute node at the click position
    const rerouteNode = createNode(rerouteMetadata, flowPosition);

    // Add the reroute node
    addNode(rerouteNode);

    // Delete the original edge
    deleteEdge(edgeId);

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

    // Add the new edges
    addEdge(sourceToReroute);
    addEdge(rerouteToTarget);

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
    closeContextMenu
  ]);

  if (!menuPosition) return null;

  return (
    <Menu
      open={true}
      onClose={closeContextMenu}
      anchorReference="anchorPosition"
      anchorPosition={{
        top: menuPosition.y,
        left: menuPosition.x
      }}
      slotProps={{
        paper: {
          style: {
            maxHeight: "400px",
            width: "200px"
          }
        }
      }}
    >
      <ContextMenuItem
        onClick={handleInsertReroute}
        IconComponent={<RouteIcon />}
        label="Insert Reroute"
        tooltip="Insert a reroute node at this position"
      />
      <ContextMenuItem
        onClick={handleDeleteEdge}
        IconComponent={<DeleteIcon />}
        label="Delete Edge"
        tooltip={
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <span>Delete this connection</span>
            <span style={{ textAlign: "center" }}>
              <kbd>Middle Mouse Button</kbd> or select the edge and press{" "}
              <kbd>Delete</kbd> or <kbd>Backspace</kbd>. Select many edges by
              holding <kbd>CTRL</kbd> or <kbd>Meta</kbd> while clicking.
            </span>
          </span>
        }
      />
    </Menu>
  );
};

export default EdgeContextMenu;
