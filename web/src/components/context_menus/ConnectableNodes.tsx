/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { shallow } from "zustand/shallow";
import {
  Menu,
  MenuItem,
  Box,
  TextField,
  InputAdornment
} from "@mui/material";
import { css } from "@emotion/react";
import useConnectableNodesStore, { ConnectableNodesState } from "../../stores/ConnectableNodesStore";
import { useReactFlow } from "@xyflow/react";
import { isConnectable, Slugify } from "../../utils/TypeHandler";
import { NodeMetadata } from "../../stores/ApiTypes";
import { rankSearchNodes } from "../../utils/nodeSearch";

import ClearIcon from "@mui/icons-material/Clear";
import SearchIcon from "@mui/icons-material/Search";
import NodeItem from "../node_menu/NodeItem";
import { Text, ToolbarIconButton } from "../ui_primitives";
import { useNodes } from "../../contexts/NodeContext";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const NODE_ROW_HEIGHT = 34;

const menuStyles = (theme: Theme) =>
  css({
    "& .MuiPaper-root": {
      height: "70vh",
      display: "flex",
      flexDirection: "column",
      width: "320px",
      borderRadius: "var(--rounded-xl)",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: theme.shadows[8],
      overflow: "hidden"
    }
  });

const scrollableContentStyles = (theme: Theme) =>
  css({
    flex: 1,
    backgroundColor: "transparent",
    "&.connectable-nodes-content": {
      minHeight: 0,
      maxHeight: "calc(70vh - 78px)",
      padding: "0"
    },
    ".node-item-container": {
      padding: "1px 6px"
    },
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: 0,
      padding: "3px 6px",
      borderRadius: "var(--rounded-md)",
      cursor: "pointer",
      transition: "background-color 0.2s ease",
      ".node-button": {
        padding: "0 6px",
        flexGrow: 1,
        "& .MuiTypography-root": {
          fontSize: theme.fontSizeSmall,
          fontWeight: 400
        }
      },
      ".icon-bg": {
        backgroundColor: "rgba(255,255,255,0.05) !important",
        borderRadius: "var(--rounded-sm)",
        padding: "2px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      ".icon-bg svg": {
        color: theme.vars.palette.grey[400],
        fontSize: "1rem"
      }
    },
    ".node:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    ".node.focused": {
      color: "var(--palette-primary-main)",
      backgroundColor: "action.selected",
      borderRadius: "var(--rounded-md)",
      boxShadow: `inset 0 0 0 1px ${theme.vars.palette.action.selected}`
    },
    ".Mui-disabled": {
      opacity: 1,
      color: "text.primary"
    },
    h4: {
      padding: "0",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      fontWeight: 600,
      opacity: 0.7
    }
  });

const fixedHeaderStyles = (theme: Theme) =>
  css({
    position: "sticky",
    top: 0,
    backgroundColor: theme.vars.palette.background.paper,
    zIndex: theme.zIndex.modal + 1,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    "&.connectable-nodes-header": {
      padding: "12px 16px"
    }
  });

const searchNodesHelper = (
  nodes: NodeMetadata[],
  searchTerm: string,
  recentNodeTypes: readonly string[]
): NodeMetadata[] => {
  return rankSearchNodes(nodes, searchTerm, recentNodeTypes);
};

const getPreferredConnectableInput = (
  metadata: NodeMetadata,
  typeMetadata: NonNullable<ConnectableNodesState["typeMetadata"]>
) => {
  const properties = metadata.properties || [];
  const compatibleProperties = properties.filter((property) =>
    isConnectable(typeMetadata, property.type, true)
  );

  if (compatibleProperties.length === 0) {
    return null;
  }

  const basicFields = metadata.basic_fields || [];
  return (
    compatibleProperties.find((property) =>
      basicFields.includes(property.name)
    ) || compatibleProperties[0]
  );
};

const ConnectableNodes: React.FC = React.memo(function ConnectableNodes() {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const reactFlowInstance = useReactFlow();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recentNodeTypes = useRecentNodesStore((state) =>
    state.recentNodes.map((node) => node.nodeType)
  );

  // Memoize store selector function to prevent re-renders
  const storeSelector = useCallback(
    (state: ConnectableNodesState) => ({
      connectableNodes: state.getConnectableNodes(),
      typeMetadata: state.typeMetadata,
      filterType: state.filterType,
      isVisible: state.isVisible,
      menuPosition: state.menuPosition,
      hideMenu: state.hideMenu,
      sourceHandle: state.sourceHandle,
      targetHandle: state.targetHandle,
      nodeId: state.nodeId
    }),
    []
  );

  const {
    connectableNodes,
    typeMetadata,
    filterType,
    isVisible,
    menuPosition,
    hideMenu,
    sourceHandle,
    targetHandle,
    nodeId
  } = useConnectableNodesStore(storeSelector);

  const filteredNodes = useMemo(
    () => searchNodesHelper(connectableNodes, searchTerm, recentNodeTypes),
    [connectableNodes, recentNodeTypes, searchTerm]
  );

  const totalCount = filteredNodes.length;
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => NODE_ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) => filteredNodes[index]?.node_type ?? index
  });

  const { createNode, addNode, addEdge, generateEdgeId } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge,
      generateEdgeId: state.generateEdgeId
    }),
    shallow
  );

  const createConnectableNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!metadata) {return;}

      const newNode = createNode(
        metadata,
        reactFlowInstance.screenToFlowPosition({
          x:
            filterType === "input"
              ? (menuPosition?.x || 500) - 50
              : menuPosition?.x || 0,
          y: menuPosition?.y || 0
        })
      );
      newNode.width = 200;
      newNode.height = 200;

      addNode(newNode);

      if (nodeId) {
        // When filterType is "input", we're looking at nodes with compatible inputs
        // because we started from an output handle
        if (filterType === "input" && typeMetadata) {
          const property = getPreferredConnectableInput(
            metadata,
            typeMetadata
          );
          if (!property) {return;}
          const edge = {
            id: generateEdgeId(),
            source: nodeId, // FROM existing node
            target: newNode.id, // TO new node
            sourceHandle: sourceHandle,
            targetHandle: property.name,
            type: "default",
            className: Slugify(typeMetadata?.type || "")
          };
          addEdge(edge);
        }

        // When filterType is "output", we're looking at nodes with compatible outputs
        // because we started from an input handle
        if (filterType === "output" && typeMetadata) {
          const output =
            metadata.outputs.length > 0 ? metadata.outputs[0] : null;
          if (!output) {return;}
          const edge = {
            id: generateEdgeId(),
            source: newNode.id, // FROM new node
            target: nodeId, // TO existing node
            sourceHandle: output.name,
            targetHandle: targetHandle,
            type: "default",
            className: Slugify(typeMetadata?.type || "")
          };
          addEdge(edge);
        }
      }
    },
    [
      reactFlowInstance,
      nodeId,
      typeMetadata,
      filterType,
      sourceHandle,
      targetHandle,
      menuPosition,
      createNode,
      addNode,
      addEdge,
      generateEdgeId
    ]
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      hideMenu();
    } else {
      e.stopPropagation();
    }
  }, [hideMenu]);

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
  }, []);

  const handleNodeClick = useCallback((nodeMetadata: NodeMetadata) => {
    createConnectableNode(nodeMetadata);
    hideMenu();
  }, [createConnectableNode, hideMenu]);

  // Empty callback for onDragStart - prevents new function creation on each render
  const handleDragStart = useCallback(
    (_node: NodeMetadata, _event: React.DragEvent<HTMLDivElement>) => {},
    []
  );

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isVisible]);

  if (!menuPosition || !isVisible) {return null;}

  return (
    <Menu
      css={menuStyles}
      open={isVisible}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
      onClose={hideMenu}
      transitionDuration={200}
      slotProps={{
        paper: {
            elevation: 0
        }
      }}
    >
      <Box css={fixedHeaderStyles} className="connectable-nodes-header">
        <MenuItem sx={{ p: 0, "&:hover": { bgcolor: "transparent" }, cursor: "default" }} disableRipple>
          <TextField
            className="connectable-nodes-search"
            size="small"
            fullWidth
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={handleSearchChange}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleSearchKeyDown}
            autoFocus={isVisible}
            inputRef={searchInputRef}
            aria-label="Search nodes"
            sx={{
                "& .MuiOutlinedInput-root": {
                    backgroundColor: "action.disabledBackground",
                    borderRadius: "var(--rounded-lg)",
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "action.selected" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "action.focus" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: theme.vars.palette.primary.main },
                }
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon
                      fontSize="small"
                      sx={{ color: "action.disabled" }}
                    />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <ToolbarIconButton
                      aria-label="clear search"
                      onClick={handleClearSearch}
                      size="small"
                      icon={<ClearIcon sx={{ fontSize: 16 }} />}
                      nodrag={false}
                    />
                  </InputAdornment>
                ) : null
              }
            }}
          />
        </MenuItem>
      </Box>

      <div
        ref={scrollRef}
        css={scrollableContentStyles}
        className="connectable-nodes-content"
        style={{ overflowY: "auto", overflowX: "hidden" }}
      >
        {totalCount === 0 ? (
          <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            <Text size="small">
              No nodes match &quot;{searchTerm}&quot;.
            </Text>
          </Box>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%"
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const nodeMetadata = filteredNodes[virtualItem.index];
              if (!nodeMetadata) {
                return null;
              }

              return (
                <div
                  className="node-item-container"
                  key={virtualItem.key}
                  style={{
                    height: virtualItem.size,
                    left: 0,
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    width: "100%"
                  }}
                >
                  <NodeItem
                    node={nodeMetadata}
                    onDragStart={handleDragStart}
                    onClick={handleNodeClick}
                    showFavoriteButton={false}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Menu>
  );
});

export default ConnectableNodes;
