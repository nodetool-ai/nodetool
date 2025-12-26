import React, { useCallback } from "react";
//mui
import { Divider, Menu } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ContextMenuItem from "./ContextMenuItem";
//icons
import InputIcon from "@mui/icons-material/Input";
import PushPinIcon from "@mui/icons-material/PushPin";
import HubIcon from "@mui/icons-material/Hub";
import ListAltIcon from "@mui/icons-material/ListAlt";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import log from "loglevel";
import { labelForType } from "../../config/data_types";
import useMetadataStore from "../../stores/MetadataStore";
import { Edge, useReactFlow } from "@xyflow/react";
import { Slugify } from "../../utils/TypeHandler";
import useConnectableNodesStore from "../../stores/ConnectableNodesStore";
import { useNodes } from "../../contexts/NodeContext";

const InputContextMenu: React.FC = () => {
  const theme = useTheme();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const reactFlowInstance = useReactFlow();

  const { type, nodeId, handleId, menuPosition, closeContextMenu } =
    useContextMenuStore((state) => ({
      type: state.type,
      nodeId: state.nodeId,
      handleId: state.handleId,
      menuPosition: state.menuPosition,
      closeContextMenu: state.closeContextMenu
    }));
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const datatypeLabel = labelForType(type?.type || "").replaceAll(" ", "");
  const inputNodePath = `nodetool.input.${datatypeLabel}Input`;
  const inputNodeMetadata = getMetadata(inputNodePath);
  const constantNodePath = `nodetool.constant.${datatypeLabel}`;
  const constantNodeMetadata = getMetadata(constantNodePath);
  const {
    showMenu,
    setNodeId,
    setFilterType,
    setConnectableType,
    setTargetHandle
  } = useConnectableNodesStore((state) => ({
    showMenu: state.showMenu,
    setNodeId: state.setNodeId,
    setFilterType: state.setFilterType,
    setConnectableType: state.setTypeMetadata,
    setTargetHandle: state.setTargetHandle
  }));
  const handleOpenNodeMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      openNodeMenu({
        x: getMousePosition().x,
        y: getMousePosition().y,
        connectDirection: "target",
        dropType: type?.type || ""
      });
    },
    [openNodeMenu, type?.type]
  );
  const { createNode, addNode, edges, setEdges, generateEdgeId } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      edges: state.edges,
      setEdges: state.setEdges,
      generateEdgeId: state.generateEdgeId
    })
  );
  const createConstantNode = useCallback(
    (event: React.MouseEvent) => {
      if (!constantNodeMetadata) {return;}
      const newNode = createNode(
        constantNodeMetadata,
        reactFlowInstance.screenToFlowPosition({
          x: event.clientX - 250,
          y: event.clientY - 200
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      addNode(newNode);
      const validEdges = edges.filter(
        (edge: Edge) =>
          !(edge.target === nodeId && edge.targetHandle === handleId)
      );
      const newEdge = {
        id: generateEdgeId(),
        source: newNode.id,
        target: nodeId || "",
        sourceHandle: "output",
        targetHandle: handleId,
        type: "default",
        className: Slugify(type?.type || "")
      };
      setEdges([...validEdges, newEdge]);
    },
    [
      constantNodeMetadata,
      createNode,
      reactFlowInstance,
      addNode,
      edges,
      generateEdgeId,
      nodeId,
      handleId,
      type?.type,
      setEdges
    ]
  );

  const handleCreateConstantNode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        createConstantNode(event);
      }
      log.info("Create Constant Node");
      closeContextMenu();
    },
    [createConstantNode, closeContextMenu]
  );

  const createInputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!inputNodeMetadata) {return;}
      const newNode = createNode(
        inputNodeMetadata,
        reactFlowInstance.screenToFlowPosition({
          x: event.clientX - 250,
          y: event.clientY - 200
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      if (handleId && newNode.data.properties.name !== undefined) {
        newNode.data.properties.name = handleId;
      }
      addNode(newNode);
      const validEdges = edges.filter(
        (edge: Edge) =>
          !(edge.target === nodeId && edge.targetHandle === handleId)
      );
      const newEdge = {
        id: generateEdgeId(),
        source: newNode.id,
        target: nodeId || "",
        sourceHandle: "output",
        targetHandle: handleId,
        type: "default",
        className: Slugify(type?.type || "")
      };
      setEdges([...validEdges, newEdge]);
    },
    [
      inputNodeMetadata,
      createNode,
      reactFlowInstance,
      addNode,
      edges,
      generateEdgeId,
      nodeId,
      handleId,
      type?.type,
      setEdges
    ]
  );

  const handleCreateInputNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createInputNode(event);
    }
    closeContextMenu();
  };

  const handleShowConnectableNodes = (
    event?: React.MouseEvent<HTMLElement>
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (menuPosition) {
      // When showing connectable nodes from an input handle,
      // we're looking for nodes with compatible outputs
      setTargetHandle(handleId); // This input handle will be the target
      setNodeId(nodeId);
      setFilterType("output");
      setConnectableType(type);
      showMenu({ x: menuPosition.x, y: menuPosition.y });
    }
    closeContextMenu();
  };

  if (!menuPosition) {return null;}
  return (
    <>
      <Menu
        className="context-menu input-context-menu"
        open={menuPosition !== null}
        onClose={closeContextMenu}
        onContextMenu={(event) => event.preventDefault()}
        anchorReference="anchorPosition"
        anchorPosition={
          menuPosition
            ? { top: menuPosition.y, left: menuPosition.x }
            : undefined
        }
        slotProps={{
          paper: {
            sx: {
              borderRadius: "12px",
              backgroundColor: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.divider}`,
              boxShadow: theme.shadows[8],
              minWidth: "220px",
              padding: "4px",
              "& .MuiDivider-root": {
                margin: "4px 0",
                borderColor: theme.vars.palette.divider
              }
            }
          }
        }}
        transitionDuration={200}
      >
        {constantNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateConstantNode}
            label="Create Constant Node"
            addButtonClassName="create-constant-node"
            IconComponent={<PushPinIcon />}
          />
        )}
        {inputNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateInputNode}
            label="Create Input Node"
            addButtonClassName="create-input-node"
            IconComponent={<InputIcon />}
          />
        )}
        <Divider />
        <ContextMenuItem
          onClick={handleShowConnectableNodes}
          label="Show Connectable Nodes"
          addButtonClassName="show-connectable-nodes"
          IconComponent={<HubIcon />}
          tooltip={"Show nodes that can be connected to this input"}
        />
        <ContextMenuItem
          onClick={handleOpenNodeMenu}
          label="Open Filtered Menu"
          addButtonClassName="open-node-menu"
          IconComponent={<ListAltIcon />}
        />
      </Menu>
    </>
  );
};

export default InputContextMenu;
