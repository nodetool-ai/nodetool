import React from "react";
import { FitViewOptions, useReactFlow } from "@xyflow/react";

import { Divider, Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
//icons
import SouthEastIcon from "@mui/icons-material/SouthEast";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AddCommentIcon from "@mui/icons-material/AddComment";
import GroupWorkIcon from "@mui/icons-material/GroupWork"; // Add this import for the group icon
import LoopIcon from "@mui/icons-material/Loop"; // Add this import for the loop icon
//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNodeStore } from "../../stores/NodeStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useCallback } from "react";
import { useCreateLoopNode } from "../../hooks/nodes/useCreateLoopNode";
import useMetadataStore from "../../stores/MetadataStore";

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

  const createNode = useNodeStore.getState().createNode;
  const addNode = useNodeStore.getState().addNode;

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

  // add comment
  const addComment = (event: React.MouseEvent) => {
    // Fake metadata for comments
    const metadata = {
      namespace: "default",
      node_type: "nodetool.workflows.base_node.Comment",
      properties: [],
      title: "Comment",
      description: "Comment",
      outputs: [],
      model_info: {},
      layout: "default",
      recommended_models: []
    };
    const newNode = createNode(
      metadata,
      reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })
    );
    newNode.width = 150;
    newNode.height = 100;
    newNode.style = { width: 150, height: 100 };
    addNode(newNode);
  };

  const addGroupNode = useCallback(
    (event: React.MouseEvent) => {
      const metadata = {
        namespace: "default",
        node_type: "nodetool.workflows.base_node.Group",
        properties: [],
        title: "Group",
        description: "Group Node",
        outputs: [],
        model_info: {},
        layout: "default",
        recommended_models: []
      };
      const newNode = createNode(
        metadata,
        reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        })
      );
      addNode(newNode);
    },
    [createNode, addNode, reactFlowInstance]
  );

  const createLoopNode = useCreateLoopNode();
  const loopMetadata = useMetadataStore((state) =>
    state.getMetadata("nodetool.group.Loop")
  );

  const addLoopNode = useCallback(
    (event: React.MouseEvent) => {
      const position = {
        x: event.clientX,
        y: event.clientY
      };
      if (loopMetadata) {
        createLoopNode(loopMetadata, position);
      }
    },
    [createLoopNode, loopMetadata]
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
            <span className="tooltip-1">
              Shift+V
              <br />
              <span
                className="attention"
                style={{
                  color: "#ccc",
                  borderLeft: `2px solid ${ThemeNodetool.palette.c_attention}`,
                  display: "block",
                  padding: "0 .5em",
                  marginTop: ".5em",
                  lineHeight: "1.1em"
                }}
              >
                no valid node data <br />
                in clipboard
              </span>
            </span>
          ) : (
            <span className="tooltip-1">Shift+V</span>
          )
        }
      />
      <Divider />
      <ContextMenuItem
        onClick={(e) => {
          e?.preventDefault();
          fitScreen();
          closeContextMenu();
        }}
        label="Fit Screen"
        IconComponent={<FitScreenIcon />}
        tooltip={"ALT+S | OPTION+S"}
      />
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
      <ContextMenuItem
        onClick={(e) => {
          if (e) {
            e.preventDefault();
            addLoopNode(e);
          }
          closeContextMenu();
        }}
        label="Add Loop"
        IconComponent={<LoopIcon />}
        tooltip={"Add a loop node"}
      />
    </Menu>
  );
};

export default React.memo(PaneContextMenu);
