/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState, useRef, useEffect } from "react";
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
import { isEqual } from "lodash";
import ClearIcon from "@mui/icons-material/Clear";
import ThemeNodetool from "../themes/ThemeNodetool";
import NodeInfo from "../node_menu/NodeInfo";
import NodeItem from "../node_menu/NodeItem";
import { useNodes } from "../../contexts/NodeContext";

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

const menuStyles = (theme: any) =>
  css({
    "& .MuiPaper-root": {
      height: "70vh",
      display: "flex",
      flexDirection: "column",
      width: "300px"
    }
  });

const scrollableContentStyles = (theme: any) =>
  css({
    overflowY: "auto",
    flex: 1,
    "&.connectable-nodes-content": {
      minHeight: 0,
      maxHeight: "calc(70vh - 130px)",
      padding: "0 0 1em .5em"
    },
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: "0",
      padding: ".25em",
      borderRadius: "3px",
      cursor: "pointer",
      ".node-button": {
        padding: ".1em",
        flexGrow: 1,
        "& .MuiTypography-root": {
          fontSize: theme.fontSizeSmall
        }
      },
      ".icon-bg": {
        backgroundColor: "transparent !important"
      },
      ".icon-bg svg": {
        color: theme.palette.c_gray4
      }
    },
    ".node:hover": {
      backgroundColor: theme.palette.c_gray2
    },
    ".node.focused": {
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "3px",
      boxShadow: "inset 1px 1px 2px #00000044"
    },
    ".Mui-disabled": {
      opacity: 0.7,
      color: "white"
    },
    h4: {
      padding: ".25em"
    }
  });

const fixedHeaderStyles = (theme: any) =>
  css({
    position: "sticky",
    top: 0,
    backgroundColor: theme.palette.background.paper,
    zIndex: theme.zIndex.modal + 1,
    "&.connectable-nodes-header": {
      padding: ".5em 0",
      backgroundColor: theme.palette.background.paper
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

interface ConnectableNodesProps {
  handleMouseEnter?: () => void;
  handleMouseLeave?: () => void;
}

const ConnectableNodes: React.FC<ConnectableNodesProps> = ({
  handleMouseEnter = () => {},
  handleMouseLeave = () => {}
}) => {
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

  const [isFocused, setIsFocused] = useState(false);
  const focusedNodeRef = useRef<HTMLDivElement>(null);
  const currentHoveredNodeRef = useRef<NodeMetadata | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isVisible]);

  const filteredNodes = searchTerm
    ? searchNodesHelper(connectableNodes, searchTerm)
    : connectableNodes;

  const groupedNodes = groupNodesByNamespace(filteredNodes);

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
      if (!metadata) return;

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
          if (!property) return;
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
          if (!output) return;
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
      targetHandle
    ]
  );

  if (!menuPosition || !isVisible) return null;

  return (
    <Menu
      slotProps={{
        paper: {
          sx: {
            backgroundColor: ThemeNodetool.palette.c_editor_bg_color,
            backgroundImage: "none"
          }
        }
      }}
      css={menuStyles}
      open={isVisible}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
      onClose={hideMenu}
    >
      <Box css={fixedHeaderStyles} className="connectable-nodes-header">
        <MenuItem disabled>
          <Typography variant="body1">Connectable Nodes</Typography>
        </MenuItem>
        <MenuItem>
          <TextField
            inputRef={searchInputRef}
            className="connectable-nodes-search"
            size="small"
            fullWidth
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                hideMenu();
              } else {
                e.stopPropagation();
              }
            }}
            slotProps={{
              input: {
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="clear search"
                      onClick={() => setSearchTerm("")}
                      edge="end"
                      size="small"
                    >
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ) : null
              }
            }}
          />
        </MenuItem>
      </Box>

      <Box css={scrollableContentStyles} className="connectable-nodes-content">
        {Object.entries(groupedNodes).map(([namespace, nodes]) => (
          <React.Fragment key={namespace}>
            <MenuItem disabled>
              <Typography
                variant="h4"
                color="textSecondary"
                fontSize={ThemeNodetool.fontSizeSmaller}
                padding={0}
                margin={0}
              >
                {namespace}
              </Typography>
            </MenuItem>
            {nodes.map((nodeMetadata: NodeMetadata) => (
              <Tooltip
                TransitionProps={{ timeout: 0 }}
                placement="left"
                title={
                  <NodeInfo
                    nodeMetadata={nodeMetadata}
                    showConnections={false}
                  />
                }
              >
                <div className="node-item-container">
                  <NodeItem
                    key={nodeMetadata.node_type}
                    ref={isFocused ? focusedNodeRef : undefined}
                    node={nodeMetadata}
                    isHovered={false}
                    isFocused={false}
                    onDragStart={() => {}}
                    onInfoClick={() => {}}
                    onMouseEnter={() => {
                      currentHoveredNodeRef.current = nodeMetadata;
                      handleMouseEnter();
                    }}
                    onMouseLeave={() => {
                      currentHoveredNodeRef.current = null;
                      handleMouseLeave();
                    }}
                    onClick={() => {
                      createConnectableNode(nodeMetadata);
                      hideMenu();
                    }}
                  />
                </div>
              </Tooltip>
            ))}
          </React.Fragment>
        ))}
      </Box>
    </Menu>
  );
};

export default memo(ConnectableNodes, isEqual);
