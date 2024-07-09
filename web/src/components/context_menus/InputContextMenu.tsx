import React, { useCallback } from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { devLog } from "../../utils/DevLog";
import LoginIcon from "@mui/icons-material/Login";
import { labelForType } from "../../config/data_types";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodeStore } from "../../stores/NodeStore";
import { Edge, useReactFlow } from "reactflow";
import { Slugify } from "../../utils/TypeHandler";

const InputContextMenu: React.FC = () => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const createNode = useNodeStore((state) => state.createNode);
  const addNode = useNodeStore((state) => state.addNode);
  const [edges, setEdges] = useNodeStore((state) => [
    state.edges,
    state.setEdges
  ]);
  const generateEdgeId = useNodeStore((state) => state.generateEdgeId);
  const reactFlowInstance = useReactFlow();

  const {
    openMenuType,
    menuPosition,
    closeContextMenu,
    type,
    nodeId,
    handleId
  } = useContextMenuStore();
  const { openNodeMenu } = useNodeMenuStore();

  const datatypeLabel = labelForType(type || "").replaceAll(" ", "");
  const inputNodePath = `nodetool.input.${datatypeLabel}Input`;
  const inputNodeMetadata = getMetadata(inputNodePath);
  const constantNodePath = `nodetool.constant.${datatypeLabel}`;
  const constantNodeMetadata = getMetadata(constantNodePath);

  const handleOpenNodeMenu = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openNodeMenu(
      getMousePosition().x,
      getMousePosition().y,
      true,
      type || "",
      "target"
    );
    closeContextMenu();
  };

  const handleCreateConstantNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createConstantNode(event);
    }
    devLog("Create Constant Node");
    closeContextMenu();
  };

  const createConstantNode = useCallback(
    (event: React.MouseEvent) => {
      if (!constantNodeMetadata) return;
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
        className: Slugify(type || "")
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
      type,
      setEdges
    ]
  );

  const createInputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!inputNodeMetadata) return;
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
        className: Slugify(type || "")
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
      type,
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

  if (openMenuType !== "input-context-menu" || !menuPosition) return null;
  return (
    <Menu
      className="context-menu input-context-menu"
      open={menuPosition !== null}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
    >
      <MenuItem disabled>
        <Typography
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
          variant="body1"
        >
          Input
        </Typography>
      </MenuItem>
      <Divider />
      {constantNodeMetadata && (
        <ContextMenuItem
          onClick={handleCreateConstantNode}
          label="Create Constant Node"
          addButtonClassName="create-constant-node"
          IconComponent={<LoginIcon />}
          tooltip={"..."}
        />
      )}
      {inputNodeMetadata && (
        <ContextMenuItem
          onClick={handleCreateInputNode}
          label="Create Input Node"
          addButtonClassName="create-input-node"
          IconComponent={<LoginIcon />}
          tooltip={"..."}
        />
      )}
      <ContextMenuItem
        onClick={handleOpenNodeMenu}
        label="Open filtered NodeMenu"
        addButtonClassName="open-node-menu"
        IconComponent={<ViewWeekIcon />}
        tooltip={"..."}
      />
    </Menu>
  );
};

export default InputContextMenu;
