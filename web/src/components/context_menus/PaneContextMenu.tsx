/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

import { Divider, Menu, Typography, Box } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
//icons
import SouthEastIcon from "@mui/icons-material/SouthEast";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AddCommentIcon from "@mui/icons-material/AddComment";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import StarIcon from "@mui/icons-material/Star";
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
  const favorites = useFavoriteNodesStore((state) => state.favorites);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

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

  const addFavoriteNode = useCallback(
    (nodeType: string, event: React.MouseEvent | undefined) => {
      if (!event) {
        return;
      }
      const metadata = getMetadata(nodeType);
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
    [createNode, addNode, reactFlowInstance, menuPosition, closeContextMenu, getMetadata]
  );

  const getNodeDisplayName = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);
      if (metadata) {
        return (
          metadata.title || metadata.node_type.split(".").pop() || nodeType
        );
      }
      return nodeType.split(".").pop() || nodeType;
    },
    [getMetadata]
  );

  if (!menuPosition) {
    return null;
  }

  return (
    <Menu
      className="context-menu pane-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
      slotProps={{
        paper: {
          sx: {
            borderRadius: "8px",
            width: "200px"
          }
        }
      }}
    >
      <ContextMenuItem
        onClick={() => {
          handlePaste();
          closeContextMenu();
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
      {favorites.length > 0 && (
        <>
          <Divider />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "0.5em",
              padding: "4px 16px",
              color: "text.secondary",
              fontSize: "0.7rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}
          >
            <StarIcon
              sx={{ fontSize: "0.85rem", color: "warning.main" }}
            />
            <Typography variant="inherit">Favorites</Typography>
          </Box>
          {favorites.map((favorite) => {
            const displayName = getNodeDisplayName(favorite.nodeType);
            return (
              <ContextMenuItem
                key={favorite.nodeType}
                onClick={(e) => addFavoriteNode(favorite.nodeType, e)}
                label={displayName}
                IconComponent={
                  <StarIcon
                    sx={{ fontSize: "1rem", color: "warning.main", opacity: 0.7 }}
                  />
                }
                tooltip={`Add ${displayName} node`}
              />
            );
          })}
        </>
      )}
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
