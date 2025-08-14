/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

import { css, Divider, Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
//icons
import SouthEastIcon from "@mui/icons-material/SouthEast";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AddCommentIcon from "@mui/icons-material/AddComment";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
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
import { useFitView } from "../../hooks/useFitView";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  GROUP_NODE_METADATA,
  COMMENT_NODE_METADATA
} from "../../utils/nodeUtils";
import { getShortcutTooltip } from "../../config/shortcuts";

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
  const fitView = useFitView();

  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }));

  const addComment = (event: React.MouseEvent) => {
    // Fake metadata for comments
    const metadata = COMMENT_NODE_METADATA;
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
            borderRadius: "8px"
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
              {getShortcutTooltip("paste-selection")}
              <br />
              <span className="attention">
                no valid node data <br />
                in clipboard
              </span>
            </span>
          ) : (
            getShortcutTooltip("paste-selection")
          )
        }
      />
      <ContextMenuItem
        onClick={(e) => {
          if (e) {
            e.preventDefault();
            fitView({ padding: 0.5 });
          }
          closeContextMenu();
        }}
        label="Fit Screen"
        IconComponent={<FitScreenIcon />}
        tooltip={getShortcutTooltip("fit-view")}
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
        tooltip={"Hold C key and drag"}
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
