/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { FitViewOptions, useReactFlow } from "@xyflow/react";

import { css, Divider, Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
//icons
import SouthEastIcon from "@mui/icons-material/SouthEast";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AddCommentIcon from "@mui/icons-material/AddComment";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import LoopIcon from "@mui/icons-material/Loop";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import ChatIcon from "@mui/icons-material/Chat";
import ImageIcon from "@mui/icons-material/Image";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import TextsmsIcon from "@mui/icons-material/Textsms";
import DataObjectIcon from "@mui/icons-material/DataObject";
//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useCreateLoopNode } from "../../hooks/nodes/useCreateLoopNode";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { GROUP_NODE_METADATA } from "../../utils/nodeUtils";

interface PaneContextMenuProps {
  top?: number;
  left?: number;
  [x: string]: any;
}
const PaneContextMenu: React.FC<PaneContextMenuProps> = () => {
  const { handlePaste } = useCopyPaste();
  const reactFlowInstance = useReactFlow();
  const { isClipboardValid } = useClipboard();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );

  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }));

  // fit screen
  const fitScreen = useCallback(() => {
    const fitOptions: FitViewOptions = {
      maxZoom: 8,
      minZoom: 0.01,
      padding: 0.5
    };

    if (reactFlowInstance) {
      reactFlowInstance.fitView(fitOptions);
    }
  }, [reactFlowInstance]);

  const addComment = (event: React.MouseEvent) => {
    // Fake metadata for comments
    const metadata = {
      namespace: "default",
      node_type: "nodetool.workflows.base_node.Comment",
      properties: [],
      title: "Comment",
      description: "Comment",
      outputs: [],
      the_model_info: {},
      layout: "default",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false
    };
    const newNode = createNode(
      metadata,
      reactFlowInstance.screenToFlowPosition({
        x: menuPosition?.x || event.clientX,
        y: menuPosition?.y || event.clientY
      })
    );
    newNode.width = 150;
    newNode.height = 100;
    newNode.style = { width: 150, height: 100 };
    addNode(newNode);
  };

  const addGroupNode = useCallback(
    (event: React.MouseEvent) => {
      // Use the imported constant
      const metadata = GROUP_NODE_METADATA;
      const position = reactFlowInstance.screenToFlowPosition({
        x: menuPosition?.x || event.clientX,
        y: menuPosition?.y || event.clientY
      });
      const newNode = createNode(metadata, position);
      addNode(newNode);
      closeContextMenu();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeContextMenu]
  );

  const createLoopNode = useCreateLoopNode();
  const loopMetadata = useMetadataStore((state) =>
    state.getMetadata("nodetool.group.Loop")
  );

  const addInputNode = useCallback(
    (nodeType: string, event: React.MouseEvent | undefined) => {
      if (!event) return;
      const metadata = useMetadataStore
        .getState()
        .getMetadata(`nodetool.input.${nodeType}`);
      if (metadata) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: menuPosition?.x || event.clientX,
          y: menuPosition?.y || event.clientY
        });
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
      closeContextMenu();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeContextMenu]
  );

  const addAgentNode = useCallback(
    (event: React.MouseEvent | undefined) => {
      if (!event) return;
      const metadata = useMetadataStore
        .getState()
        .getMetadata(`nodetool.agents.Agent`);
      if (metadata) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: menuPosition?.x || event.clientX,
          y: menuPosition?.y || event.clientY
        });
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
      closeContextMenu();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeContextMenu]
  );

  const addLLMNode = useCallback(
    (event: React.MouseEvent | undefined) => {
      if (!event) return;
      const metadata = useMetadataStore
        .getState()
        .getMetadata(`nodetool.llms.LLM`);
      if (metadata) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: menuPosition?.x || event.clientX,
          y: menuPosition?.y || event.clientY
        });
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
      closeContextMenu();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeContextMenu]
  );

  const addDataGeneratorNode = useCallback(
    (event: React.MouseEvent | undefined) => {
      if (!event) return;
      const metadata = useMetadataStore
        .getState()
        .getMetadata(`nodetool.generators.DataGenerator`);
      if (metadata) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: menuPosition?.x || event.clientX,
          y: menuPosition?.y || event.clientY
        });
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
      closeContextMenu();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeContextMenu]
  );

  const addTaskPlannerNode = useCallback(
    (event: React.MouseEvent | undefined) => {
      if (!event) return;
      const metadata = useMetadataStore
        .getState()
        .getMetadata(`nodetool.agents.TaskPlanner`);
      if (metadata) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: menuPosition?.x || event.clientX,
          y: menuPosition?.y || event.clientY
        });
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
      closeContextMenu();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeContextMenu]
  );

  if (!menuPosition) {
    return null;
  }

  return (
    <Menu
      className="context-menu pane-context-menu"
      open={menuPosition !== null}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
      slotProps={{
        paper: {
          sx: {
            "& .MuiList-root": {
              padding: "0"
            },
            "& .MuiMenuItem-root": {
              padding: "3px 15px"
            }
          }
        }
      }}
    >
      <ContextMenuItem
        onClick={() => {
          handlePaste();
        }}
        label="Paste"
        addButtonClassName={`action ${!isClipboardValid ? "disabled" : ""}`}
        IconComponent={<SouthEastIcon />}
        tooltip={
          !isClipboardValid ? (
            <span>
              Shift+V
              <br />
              <span className="attention">
                no valid node data <br />
                in clipboard
              </span>
            </span>
          ) : (
            <span>Shift+V</span>
          )
        }
      />
      <ContextMenuItem
        onClick={(e) => {
          if (e) {
            e.preventDefault();
            fitScreen();
          }
          closeContextMenu();
        }}
        label="Fit Screen"
        IconComponent={<FitScreenIcon />}
        tooltip={"F Key"}
      />
      <Divider />
      <ContextMenuItem
        onClick={addAgentNode}
        label="Add Agent"
        IconComponent={<SupportAgentIcon />}
        tooltip="Add an Agent node"
      />
      <ContextMenuItem
        onClick={addTaskPlannerNode}
        label="Add Task Planner"
        IconComponent={<TextsmsIcon />}
        tooltip="Add a Task Planner node"
      />
      <ContextMenuItem
        onClick={addLLMNode}
        label="Add LLM"
        IconComponent={<TextsmsIcon />}
        tooltip="Add an LLM node"
      />
      <ContextMenuItem
        onClick={addDataGeneratorNode}
        label="Add Data Generator"
        IconComponent={<DataObjectIcon />}
        tooltip="Add a data generator node"
      />
      <Divider />
      <ContextMenuItem
        onClick={(e) => addInputNode("StringInput", e)}
        label="String Input"
        IconComponent={<TextFieldsIcon />}
        tooltip="Add a string input node"
      />
      <ContextMenuItem
        onClick={(e) => addInputNode("IntegerInput", e)}
        label="Integer Input"
        IconComponent={<NumbersIcon />}
        tooltip="Add an integer input node"
      />
      <ContextMenuItem
        onClick={(e) => addInputNode("ChatInput", e)}
        label="Chat Input"
        IconComponent={<ChatIcon />}
        tooltip="Add a chat input node"
      />
      <ContextMenuItem
        onClick={(e) => addInputNode("ImageInput", e)}
        label="Image Input"
        IconComponent={<ImageIcon />}
        tooltip="Add an image input node"
      />
      <Divider />
      <ContextMenuItem
        onClick={(e) => {
          if (e) {
            e.preventDefault();
            addComment(e);
          }
          closeContextMenu();
        }}
        label="Add Comment"
        IconComponent={<AddCommentIcon />}
        tooltip={"C + Click or Drag"}
      />
      <ContextMenuItem
        onClick={(e) => {
          if (e) {
            e.preventDefault();
            addGroupNode(e);
          }
          closeContextMenu();
        }}
        label="Add Group"
        IconComponent={<GroupWorkIcon />}
        tooltip={"Add a group node"}
      />
    </Menu>
  );
};

export default React.memo(PaneContextMenu);
