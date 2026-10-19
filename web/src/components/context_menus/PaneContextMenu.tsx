/** @jsxImportSource @emotion/react */
import { useTranslation } from "react-i18next";
import React, { useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";

import { Divider, ContextMenu, ListSubheader } from "../ui_primitives";
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
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import SchemaIcon from "@mui/icons-material/Schema";
import AppsIcon from "@mui/icons-material/Apps";
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
// From the constants module, not the node barrels: those re-export the node
// components, and this menu is reachable from the app shell.
import {
  WORKFLOW_NODE_TYPE,
  SUBGRAPH_NODE_TYPE,
  APP_NODE_TYPE
} from "../../constants/nodeTypes";
import { shallow } from "zustand/shallow";
import {
  CONSTANT_NODE_OPTIONS,
  INPUT_NODE_OPTIONS
} from "./paneNodeOptions";

const PaneContextMenu: React.FC = () => {
  const { t } = useTranslation();
  const localizeNodeTypeLabel = (label: string): string => {
    const keys: Record<string, string> = {
      Audio: "audio",
      Bool: "boolean",
      Boolean: "boolean",
      "Data Frame": "dataFrame",
      Date: "date",
      "Date Time": "dateTime",
      Dict: "dictionary",
      Document: "document",
      Float: "float",
      Image: "image",
      Integer: "integer",
      JSON: "json",
      List: "list",
      "Model 3D": "model3d",
      Select: "select",
      String: "string",
      Video: "video"
    };
    const key = keys[label];
    return key ? t(`screen_editor.nodeType.${key}`) : label;
  };
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
  }), shallow);

  const closeAllMenus = useCallback(() => {
    setConstantMenuAnchorEl(null);
    setInputMenuAnchorEl(null);
    closeContextMenu();
  }, [closeContextMenu]);


  const addComment = useCallback(
    (event: React.MouseEvent) => {
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
    (nodeType: string) => (event: React.MouseEvent | undefined) => {
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

  const handleCreateNode = useCallback(
    (nodeType: string) => (event?: React.MouseEvent) => {
      if (!event) {
        return;
      }
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        console.error(`Metadata not found for node type: ${nodeType}`);
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

  // Paste where the menu was opened, not under the clicked menu item.
  const handlePasteAndClose = useCallback(() => {
    void handlePaste(menuPosition ?? undefined);
    closeAllMenus();
  }, [handlePaste, closeAllMenus, menuPosition]);

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
      <ContextMenu
        className="context-menu pane-context-menu"
        open={menuPosition !== null}
        onClose={closeAllMenus}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        MenuListProps={{
          onClick: (event) => event.stopPropagation()
        }}
        position={menuPosition}
        slotProps={{
          paper: {
            className: "context-menu pane-context-menu"
          }
        }}
        paperSx={{ width: "240px" }}
      >
        <ContextMenuItem
          onClick={handlePasteAndClose}
          label={t("screen_editor.paste")}
          disabled={!isClipboardValid}
          IconComponent={<SouthEastIcon />}
          tooltip={
            !isClipboardValid ? (
              <span>
                {getShortcutTooltip("paste")}
                <br />
                <span className="attention">
                  {t("screen_editor.noValidNodeData")} <br />
                  {t("screen_editor.inClipboard")}
                </span>
              </span>
            ) : (
              getShortcutTooltip("paste")
            )
          }
        />
        <ContextMenuItem
          onClick={handleFitViewAndClose}
          label={t("screen_editor.fitScreen")}
          IconComponent={<FitScreenIcon />}
          tooltip={getShortcutTooltip("fitView")}
        />
        {favorites.length > 0 && [
          <Divider key="favorites-divider" />,
          <ListSubheader key="favorites-header">{t("screen_editor.favorites")}</ListSubheader>,
          ...favorites.map((favorite) => {
            const displayName = getNodeDisplayName(favorite.nodeType);
            return (
              <ContextMenuItem
                key={favorite.nodeType}
                onClick={addFavoriteNode(favorite.nodeType)}
                label={displayName}
                IconComponent={<StarIcon />}
                tooltip={t("screen_editor.addNamedNode", { name: displayName })}
              />
            );
          })
        ]}
        <Divider />
        <ContextMenuItem
          onClick={handleOpenConstantMenu}
          label={t("screen_editor.addConstantNode")}
          IconComponent={<DataObjectIcon />}
          hasSubmenu
        />
        <ContextMenuItem
          onClick={handleOpenInputMenu}
          label={t("screen_editor.addInputNode")}
          IconComponent={<InputIcon />}
          hasSubmenu
        />
        <Divider />
        <ContextMenuItem
          onClick={handleAddCommentAndClose}
          label={t("screen_editor.addComment")}
          IconComponent={<AddCommentIcon />}
          tooltip={t("screen_editor.holdCAndDrag")}
        />
        <ContextMenuItem
          onClick={handleAddGroupAndClose}
          label={t("screen_editor.addGroup")}
          IconComponent={<GroupWorkIcon />}
          tooltip={t("screen_editor.addGroupTooltip")}
        />
        <ContextMenuItem
          onClick={handleCreateNode(WORKFLOW_NODE_TYPE)}
          label={t("screen_editor.addWorkflow")}
          IconComponent={<AccountTreeIcon />}
          tooltip={t("screen_editor.addWorkflowTooltip")}
        />
        <ContextMenuItem
          onClick={handleCreateNode(SUBGRAPH_NODE_TYPE)}
          label={t("screen_editor.addSubgraph")}
          IconComponent={<SchemaIcon />}
          tooltip={t("screen_editor.addSubgraphTooltip")}
        />
        <ContextMenuItem
          onClick={handleCreateNode(APP_NODE_TYPE)}
          label={t("screen_editor.addApp")}
          IconComponent={<AppsIcon />}
          tooltip={t("screen_editor.addAppTooltip")}
        />
      </ContextMenu>
      <ContextMenu
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
        {CONSTANT_NODE_OPTIONS.map((option) =>
          getMetadata(option.nodeType) ? (
            <ContextMenuItem
              key={option.nodeType}
              onClick={handleCreateNode(option.nodeType)}
              label={localizeNodeTypeLabel(option.label)}
            />
          ) : null
        )}
      </ContextMenu>
      <ContextMenu
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
        {INPUT_NODE_OPTIONS.map((option) =>
          getMetadata(option.nodeType) ? (
            <ContextMenuItem
              key={option.nodeType}
              onClick={handleCreateNode(option.nodeType)}
              label={localizeNodeTypeLabel(option.label)}
            />
          ) : null
        )}
      </ContextMenu>
    </>
  );
};

export default React.memo(PaneContextMenu);
