/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  Menu,
  MenuItem,
  Typography,
  Box,
  TextField,
  IconButton,
  InputAdornment,
  Tooltip
} from "@mui/material";
import { css } from "@emotion/react";
import useConnectableNodesStore from "../../stores/ConnectableNodesStore";
import { useReactFlow } from "@xyflow/react";
import { isConnectable, Slugify } from "../../utils/TypeHandler";
import { NodeMetadata } from "../../stores/ApiTypes";
import isEqual from "lodash/isEqual";
import ClearIcon from "@mui/icons-material/Clear";
import SearchIcon from "@mui/icons-material/Search";
import NodeInfo from "../node_menu/NodeInfo";
import NodeItem from "../node_menu/NodeItem";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface GroupedNodes {
  [namespace: string]: NodeMetadata[];
}

const groupNodesByNamespace = (nodes: NodeMetadata[]): GroupedNodes => {
  return nodes.reduce((acc: GroupedNodes, node) => {
    const namespace = node.namespace || "Other";
    if (!acc[namespace]) {
      acc[namespace] = [];
    }
    acc[namespace].push(node);
    return acc;
  }, {});
};

const menuStyles = (theme: Theme) =>
  css({
    "& .MuiPaper-root": {
      height: "70vh",
      display: "flex",
      flexDirection: "column",
      width: "320px",
      borderRadius: "12px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: theme.shadows[8],
      overflow: "hidden"
    }
  });

const scrollableContentStyles = (theme: Theme) =>
  css({
    overflowY: "auto",
    flex: 1,
    backgroundColor: "transparent",
    "&.connectable-nodes-content": {
      minHeight: 0,
      maxHeight: "calc(70vh - 130px)",
      padding: "0",
      overflowX: "hidden"
    },
    ".namespace": {
      backgroundColor: theme.vars.palette.action.hover,
      padding: "4px 0 4px 12px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: "32px"
    },
    ".node-item-container": {
        padding: "2px 8px",
    },
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: "2px 0",
      padding: "6px 8px",
      borderRadius: "6px",
      cursor: "pointer",
      transition: "background-color 0.2s ease",
      ".node-button": {
        padding: "0 8px",
        flexGrow: 1,
        "& .MuiTypography-root": {
          fontSize: theme.fontSizeSmall,
          fontWeight: 400
        }
      },
      ".icon-bg": {
        backgroundColor: "rgba(255,255,255,0.05) !important",
        borderRadius: "4px",
        padding: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      ".icon-bg svg": {
        color: theme.vars.palette.grey[400],
        fontSize: "1.2rem"
      }
    },
    ".node:hover": {
      backgroundColor: "action.hover"
    },
    ".node.focused": {
      color: "var(--palette-primary-main)",
      backgroundColor: "action.selected",
      borderRadius: "6px",
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
  searchTerm: string
): NodeMetadata[] => {
  const term = searchTerm.toLowerCase();
  return nodes.filter(
    (node) =>
      node.title.toLowerCase().includes(term) ||
      node.description?.toLowerCase().includes(term) ||
      node.node_type.toLowerCase().includes(term)
  );
};

const ConnectableNodes: React.FC = React.memo(function ConnectableNodes() {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const reactFlowInstance = useReactFlow();
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
  } = useConnectableNodesStore((state) => ({
    connectableNodes: state.getConnectableNodes(),
    typeMetadata: state.typeMetadata,
    filterType: state.filterType,
    isVisible: state.isVisible,
    menuPosition: state.menuPosition,
    hideMenu: state.hideMenu,
    sourceHandle: state.sourceHandle,
    targetHandle: state.targetHandle,
    nodeId: state.nodeId
  }));

  const filteredNodes = useMemo(
    () =>
      searchTerm
        ? searchNodesHelper(connectableNodes, searchTerm)
        : connectableNodes,
    [connectableNodes, searchTerm]
  );

  const groupedNodes = useMemo(
    () => groupNodesByNamespace(filteredNodes),
    [filteredNodes]
  );

  const totalCount = filteredNodes.length;

  const { createNode, addNode, addEdge, generateEdgeId } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge,
      generateEdgeId: state.generateEdgeId
    })
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
          const properties = metadata?.properties || [];
          const property = properties.find((property) =>
            isConnectable(typeMetadata, property.type, true)
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

  const handleNodeClickWrapper = useCallback((nodeMetadata: NodeMetadata) => {
    return () => handleNodeClick(nodeMetadata);
  }, [handleNodeClick]);

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
        <MenuItem disabled sx={{ opacity: "1 !important", p: 0, mb: 1 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%"
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} color="text.primary">
              Connectable Nodes
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", bgcolor: "action.selected", px: 1, py: 0.5, borderRadius: 1 }}>
              {totalCount}
            </Typography>
          </Box>
        </MenuItem>
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
            aria-label="Search nodes"
            sx={{
                "& .MuiOutlinedInput-root": {
                    backgroundColor: "action.disabledBackground",
                    borderRadius: "8px",
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
                    <IconButton
                      aria-label="clear search"
                      onClick={handleClearSearch}
                      edge="end"
                      size="small"
                    >
                      <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null
              }
            }}
          />
        </MenuItem>
      </Box>

      <Box css={scrollableContentStyles} className="connectable-nodes-content">
        {totalCount === 0 ? (
          <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">
              No nodes match &quot;{searchTerm}&quot;.
            </Typography>
          </Box>
        ) : (
          Object.entries(groupedNodes).map(([namespace, nodes]) => (
            <React.Fragment key={namespace}>
              <MenuItem className="namespace" disabled sx={{ opacity: "1 !important" }}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  fontSize={10}
                  fontWeight={700}
                >
                  {namespace.toUpperCase()}
                </Typography>
              </MenuItem>
              {nodes.map((nodeMetadata: NodeMetadata) => (
                <Tooltip
                  leaveDelay={10}
                  enterDelay={500}
                  key={nodeMetadata.node_type}
                  TransitionProps={{ timeout: 0 }}
                  placement="right"
                  disableInteractive
                  sx={{ padding: "0" }}
                  slotProps={{
                    popper: {
                      sx: { zIndex: theme.zIndex.tooltip + 2, maxWidth: 320 },
                      modifiers: [
                        { name: "offset", options: { offset: [0, 8] } },
                        { name: "preventOverflow", options: { padding: 8 } },
                        {
                          name: "flip",
                          options: { fallbackPlacements: ["left", "right"] }
                        }
                      ]
                    }
                  }}
                  title={
                    <NodeInfo
                      nodeMetadata={nodeMetadata}
                      showConnections={false}
                      menuWidth={240}
                    />
                  }
                >
                  <div className="node-item-container">
                    <NodeItem
                      key={nodeMetadata.node_type}
                      node={nodeMetadata}
                      onDragStart={() => {}}
                      onClick={handleNodeClickWrapper(nodeMetadata)}
                    />
                  </div>
                </Tooltip>
              ))}
            </React.Fragment>
          ))
        )}
      </Box>
    </Menu>
  );
});

export default memo(ConnectableNodes, isEqual);
