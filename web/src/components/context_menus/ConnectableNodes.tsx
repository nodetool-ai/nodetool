import React, { memo, useCallback, useState } from "react";
import {
  Menu,
  MenuItem,
  Typography,
  Divider,
  Box,
  TextField,
  IconButton,
  InputAdornment
} from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
import useConnectableNodesStore from "../../stores/ConnectableNodesStore";
import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import { isConnectable, Slugify } from "../../utils/TypeHandler";
import { getTimestampForFilename } from "../../utils/formatDateAndTime";
import { NodeMetadata } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { styled } from "@mui/material/styles";
import ClearIcon from "@mui/icons-material/Clear";

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

const StyledMenu = styled(Menu)({
  "& .MuiPaper-root": {
    height: "50vh",
    display: "flex",
    flexDirection: "column",
    width: "300px"
  }
});

const ScrollableContent = styled(Box)({
  overflowY: "auto",
  flex: 1,
  "&.connectable-nodes-content": {
    minHeight: 0,
    maxHeight: "calc(50vh - 120px)"
  }
});

const FixedHeader = styled(Box)(({ theme }) => ({
  position: "sticky",
  top: 0,
  backgroundColor: theme.palette.background.paper,
  zIndex: theme.zIndex.modal + 1,
  borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
  "&.connectable-nodes-header": {
    padding: "8px 0",
    backgroundColor: theme.palette.background.paper
  }
}));

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

const ConnectableNodes: React.FC = () => {
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

  const filteredNodes = searchTerm
    ? searchNodesHelper(connectableNodes, searchTerm)
    : connectableNodes;

  const groupedNodes = groupNodesByNamespace(filteredNodes);

  const createConnectableNode = useCallback(
    (event: React.MouseEvent, metadata: NodeMetadata) => {
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
    <StyledMenu
      className="context-menu connectable-nodes-menu"
      open={isVisible}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
      onClose={hideMenu}
    >
      <FixedHeader className="connectable-nodes-header">
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
            InputProps={{
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
            }}
          />
        </MenuItem>
        <Divider />
      </FixedHeader>

      <ScrollableContent className="connectable-nodes-content">
        {Object.entries(groupedNodes).map(([namespace, nodes]) => (
          <React.Fragment key={namespace}>
            <MenuItem disabled>
              <Typography variant="subtitle2" color="textSecondary">
                {namespace}
              </Typography>
            </MenuItem>
            {nodes.map((nodeMetadata: NodeMetadata) => (
              <ContextMenuItem
                key={nodeMetadata.node_type}
                onClick={(e) => {
                  if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    createConnectableNode(e, nodeMetadata);
                  }
                  hideMenu();
                }}
                label={nodeMetadata.title}
                tooltip={
                  <MarkdownRenderer
                    content={nodeMetadata.description || "..."}
                  />
                }
              />
            ))}
            <Divider />
          </React.Fragment>
        ))}
      </ScrollableContent>
    </StyledMenu>
  );
};

export default memo(ConnectableNodes, isEqual);