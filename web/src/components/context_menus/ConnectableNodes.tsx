/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState, useRef } from "react";
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
import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import { isConnectable, Slugify } from "../../utils/TypeHandler";
import { NodeMetadata } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import ClearIcon from "@mui/icons-material/Clear";
import ThemeNodetool from "../themes/ThemeNodetool";
import NodeInfo from "../node_menu/NodeInfo";
import NodeItem from "../node_menu/NodeItem";

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
      padding: "0.025em",
      borderRadius: "3px",
      cursor: "pointer",
      ".node-button": {
        padding: ".1em .5em",
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
  const { createNode, addNode, addEdge, generateEdgeId } = useNodeStore(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge,
      generateEdgeId: state.generateEdgeId
    })
  );
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

  const filteredNodes = searchTerm
    ? searchNodesHelper(connectableNodes, searchTerm)
    : connectableNodes;

  const groupedNodes = groupNodesByNamespace(filteredNodes);

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

      addNode(newNode);

      if (nodeId) {
        // Find the property that is connectable to the source handle
        // and create an edge from the node to the new node
        if (filterType === "output" && typeMetadata) {
          const properties = metadata?.properties || [];
          const property = properties.find((property) =>
            isConnectable(typeMetadata, property.type, true)
          );
          if (!property) return;
          const edge = {
            id: generateEdgeId(),
            source: nodeId,
            target: newNode.id,
            sourceHandle: sourceHandle,
            targetHandle: property.name,
            type: "default",
            className: Slugify(typeMetadata?.type || "")
          };
          addEdge(edge);
        }
        if (filterType === "input" && typeMetadata) {
          // Find the output that is connectable to the target handle
          // and create an edge from the new node to the node
          const output =
            metadata.outputs.length > 0 ? metadata.outputs[0] : null;
          if (!output) return;
          const edge = {
            id: generateEdgeId(),
            source: newNode.id,
            target: nodeId,
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
      createNode,
      reactFlowInstance,
      addNode,
      addEdge,
      generateEdgeId,
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
            className="connectable-nodes-search"
            size="small"
            fullWidth
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
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
                slotProps={{
                  tooltip: {
                    className: "connectable-node-info",
                    sx: {
                      backgroundColor: "black",
                      color: "white",
                      fontSize: "1rem",
                      maxWidth: "none"
                    }
                  }
                }}
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
                    showInfo={false}
                  />
                </div>
                {/* <Button 
                  sx={{ width: "100%", color: "white" }}
                  onClick={(e) => createConnectableNode(e, nodeMetadata)}
                >
                  {nodeMetadata.title}
                </Button> */}
              </Tooltip>

              //       createConnectableNode(e, nodeMetadata);
              //     }
              //     hideMenu();
              //   }}
              //   label={nodeMetadata.title}
              //   tooltip={
              //     <NodeInfo
              //       nodeMetadata={nodeMetadata}
              //       showConnections={false}
              //     />
              //   }
              // />
            ))}
          </React.Fragment>
        ))}
      </Box>
    </Menu>
  );
};

export default memo(ConnectableNodes, isEqual);
