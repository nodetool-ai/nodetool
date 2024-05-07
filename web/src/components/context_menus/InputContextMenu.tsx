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
import { useReactFlow } from "reactflow";
import { Slugify } from "../../utils/TypeHandler";

const InputContextMenu: React.FC = () => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const createNode = useNodeStore((state) => state.createNode);
  const addNode = useNodeStore((state) => state.addNode);
  const addEdge = useNodeStore((state) => state.addEdge);
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
        reactFlowInstance.project({
          x: event.clientX - 250,
          y: event.clientY - 200
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      newNode.data.properties.value = {
        type: constantNodePath
      };
      addNode(newNode);
      addEdge({
        id: generateEdgeId(),
        source: newNode.id,
        target: nodeId || "",
        sourceHandle: "output",
        targetHandle: handleId,
        type: "default",
        className: Slugify(type || "")
      });
    },
    [
      createNode,
      reactFlowInstance,
      addNode,
      constantNodeMetadata,
      addEdge,
      generateEdgeId,
      type,
      nodeId,
      handleId,
      constantNodePath
    ]
  );

  const createInputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!inputNodeMetadata) return;
      const newNode = createNode(
        inputNodeMetadata,
        reactFlowInstance.project({
          x: event.clientX - 250,
          y: event.clientY - 200
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      newNode.data.properties.value = {
        type: inputNodePath
      };
      addNode(newNode);
      addEdge({
        id: generateEdgeId(),
        source: newNode.id,
        target: nodeId || "",
        sourceHandle: "output",
        targetHandle: handleId,
        type: "default",
        className: Slugify(type || "")
      });
    },
    [
      createNode,
      reactFlowInstance,
      addNode,
      inputNodeMetadata,
      addEdge,
      generateEdgeId,
      type,
      nodeId,
      handleId,
      inputNodePath
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
      <ContextMenuItem
        onClick={handleCreateConstantNode}
        label="Create Constant Node"
        addButtonClassName="create-constant-node"
        IconComponent={<LoginIcon />}
        tooltip={"..."}
      />
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
