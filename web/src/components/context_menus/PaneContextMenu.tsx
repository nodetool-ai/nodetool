/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";

import { Divider, Menu, Typography, Box, Button } from "@mui/material";
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
import DataObjectIcon from "@mui/icons-material/DataObject";
import InputIcon from "@mui/icons-material/Input";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
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
  const [constantMenuAnchorEl, setConstantMenuAnchorEl] =
    useState<HTMLElement | null>(null);
  const [inputMenuAnchorEl, setInputMenuAnchorEl] =
    useState<HTMLElement | null>(null);

  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }));

  const closeAllMenus = useCallback(() => {
    setConstantMenuAnchorEl(null);
    setInputMenuAnchorEl(null);
    closeContextMenu();
  }, [closeContextMenu]);


  const addComment = useCallback(
    (event: React.MouseEvent) => {
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
    },
    [createNode, addNode, reactFlowInstance, menuPosition]
  );

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
      closeAllMenus();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeAllMenus]
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
      closeAllMenus();
    },
    [
      createNode,
      addNode,
      reactFlowInstance,
      menuPosition,
      closeAllMenus,
      getMetadata
    ]
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

  const constantNodeOptions = useMemo(
    () =>
      [
        { label: "Bool", nodeTypes: ["nodetool.constant.Bool"] },
        { label: "Data Frame", nodeTypes: ["nodetool.constant.DataFrame"] },
        { label: "Date", nodeTypes: ["nodetool.constant.Date"] },
        { label: "Date Time", nodeTypes: ["nodetool.constant.DateTime"] },
        { label: "Dict", nodeTypes: ["nodetool.constant.Dict"] },
        { label: "Document", nodeTypes: ["nodetool.constant.Document"] },
        { label: "Float", nodeTypes: ["nodetool.constant.Float"] },
        { label: "Image", nodeTypes: ["nodetool.constant.Image"] },
        { label: "Integer", nodeTypes: ["nodetool.constant.Integer"] },
        { label: "JSON", nodeTypes: ["nodetool.constant.JSON"] },
        { label: "List", nodeTypes: ["nodetool.constant.List"] },
        { label: "Audio", nodeTypes: ["nodetool.constant.Audio"] },
        {
          label: "Model 3D",
          nodeTypes: [
            "nodetool.constant.Model3D",
            "nodetool.constant.Model3d",
            "nodetool.constant.Model_3D"
          ]
        },
        { label: "String", nodeTypes: ["nodetool.constant.String"] },
        { label: "Video", nodeTypes: ["nodetool.constant.Video"] }
      ].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  const inputNodeOptions = useMemo(
    () =>
      [
        { label: "String", nodeTypes: ["nodetool.input.StringInput"] },
        { label: "Integer", nodeTypes: ["nodetool.input.IntegerInput"] },
        { label: "Float", nodeTypes: ["nodetool.input.FloatInput"] },
        { label: "Boolean", nodeTypes: ["nodetool.input.BooleanInput"] },
        { label: "Image", nodeTypes: ["nodetool.input.ImageInput"] },
        { label: "Audio", nodeTypes: ["nodetool.input.AudioInput"] },
        { label: "Video", nodeTypes: ["nodetool.input.VideoInput"] },
        { label: "Document", nodeTypes: ["nodetool.input.DocumentInput"] },
        { label: "Data Frame", nodeTypes: ["nodetool.input.DataFrameInput"] }
      ].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  const resolveNodeType = useCallback(
    (nodeTypes: string[]) =>
      nodeTypes.find((nodeType) => Boolean(getMetadata(nodeType))) || null,
    [getMetadata]
  );

  const handleCreateNode = useCallback(
    (nodeType: string | null, event?: React.MouseEvent) => {
      if (!event || !nodeType) {
        return;
      }
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        return;
      }
      const position = reactFlowInstance.screenToFlowPosition({
        x: menuPosition?.x || event.clientX,
        y: menuPosition?.y || event.clientY
      });
      const newNode = createNode(metadata, position);
      addNode(newNode);
      closeAllMenus();
    },
    [
      getMetadata,
      createNode,
      addNode,
      reactFlowInstance,
      menuPosition,
      closeAllMenus
    ]
  );

  const handleOpenConstantMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (!event) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setConstantMenuAnchorEl(event.currentTarget);
      setInputMenuAnchorEl(null);
    },
    []
  );

  const handleOpenInputMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (!event) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setInputMenuAnchorEl(event.currentTarget);
      setConstantMenuAnchorEl(null);
    },
    []
  );

  const handlePasteAndClose = useCallback(() => {
    handlePaste();
    closeAllMenus();
  }, [handlePaste, closeAllMenus]);

  const handleFitViewAndClose = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        fitView({ padding: 0.5 });
      }
      closeAllMenus();
    },
    [fitView, closeAllMenus]
  );

  const handleAddCommentAndClose = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        addComment(event);
      }
      closeAllMenus();
    },
    [addComment, closeAllMenus]
  );

  const handleAddGroupAndClose = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        addGroupNode(event);
      }
      closeAllMenus();
    },
    [addGroupNode, closeAllMenus]
  );

  if (!menuPosition) {
    return null;
  }

  return (
    <>
      <Menu
        className="context-menu pane-context-menu"
        open={menuPosition !== null}
        onClose={closeAllMenus}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        MenuListProps={{
          onClick: (event) => event.stopPropagation()
        }}
        anchorReference="anchorPosition"
        anchorPosition={
          menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
        }
        slotProps={{
          paper: {
            className: "context-menu pane-context-menu",
            sx: {
              borderRadius: "8px",
              width: "240px"
            }
          }
        }}
      >
        <ContextMenuItem
          onClick={handlePasteAndClose}
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
          onClick={handleFitViewAndClose}
          label="Fit Screen"
          IconComponent={<FitScreenIcon />}
          tooltip={getShortcutTooltip("fit-view")}
        />
        {favorites.length > 0 && [
          <Divider key="favorites-divider" />,
          <Box
            key="favorites-header"
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
          </Box>,
          ...favorites.map((favorite) => {
            const displayName = getNodeDisplayName(favorite.nodeType);
            return (
              <ContextMenuItem
                key={favorite.nodeType}
                onClick={addFavoriteNode.bind(null, favorite.nodeType)}
                label={displayName}
                IconComponent={
                  <StarIcon
                    sx={{ fontSize: "1rem", color: "warning.main", opacity: 0.7 }}
                  />
                }
                tooltip={`Add ${displayName} node`}
              />
            );
          })
        ]}
        <Divider />
        <ContextMenuItem
          onClick={handleOpenConstantMenu}
          controlElement={
            <Button
              className="action"
              endIcon={<KeyboardArrowRightIcon />}
            >
              <DataObjectIcon />
              <span className="label">Add Constant Node</span>
            </Button>
          }
        />
        <ContextMenuItem
          onClick={handleOpenInputMenu}
          controlElement={
            <Button
              className="action"
              endIcon={<KeyboardArrowRightIcon />}
            >
              <InputIcon />
              <span className="label">Add Input Node</span>
            </Button>
          }
        />
        <Divider />
        <ContextMenuItem
          onClick={handleAddCommentAndClose}
          label="Add Comment"
          IconComponent={<AddCommentIcon />}
          tooltip={"Hold C key and drag"}
        />
        <ContextMenuItem
          onClick={handleAddGroupAndClose}
          label="Add Group"
          IconComponent={<GroupWorkIcon />}
          tooltip={"Add a group node"}
        />
      </Menu>
      <Menu
        className="context-menu pane-submenu"
        anchorEl={constantMenuAnchorEl}
        open={Boolean(constantMenuAnchorEl)}
        onClose={() => setConstantMenuAnchorEl(null)}
        slotProps={{
          paper: {
            className: "context-menu pane-submenu"
          }
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
      >
        {constantNodeOptions.map((option) => {
          const nodeType = resolveNodeType(option.nodeTypes);
          if (!nodeType) {
            return null;
          }
          return (
            <ContextMenuItem
              key={nodeType}
              onClick={handleCreateNode.bind(null, nodeType)}
              label={option.label}
            />
          );
        })}
      </Menu>
      <Menu
        className="context-menu pane-submenu"
        anchorEl={inputMenuAnchorEl}
        open={Boolean(inputMenuAnchorEl)}
        onClose={() => setInputMenuAnchorEl(null)}
        slotProps={{
          paper: {
            className: "context-menu pane-submenu"
          }
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
      >
        {inputNodeOptions.map((option) => {
          const nodeType = resolveNodeType(option.nodeTypes);
          if (!nodeType) {
            return null;
          }
          return (
            <ContextMenuItem
              key={nodeType}
              onClick={handleCreateNode.bind(null, nodeType)}
              label={option.label}
            />
          );
        })}
      </Menu>
    </>
  );
};

export default React.memo(PaneContextMenu);
