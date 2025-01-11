import React, { memo, useCallback } from "react";
import { Menu, MenuItem, Typography, Divider } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
import useConnectableNodesStore from "../../stores/ConnectableNodesStore";
import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import { isConnectable, Slugify } from "../../utils/TypeHandler";
import { getTimestampForFilename } from "../../utils/formatDateAndTime";
import { NodeMetadata } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import MarkdownRenderer from "../../utils/MarkdownRenderer";

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

const ConnectableNodes: React.FC = () => {
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

  const groupedNodes = groupNodesByNamespace(connectableNodes);

  return (
    <Menu
      className="context-menu connectable-nodes-menu"
      open={isVisible}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
      onClose={hideMenu}
    >
      <MenuItem disabled>
        <Typography
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
          variant="body1"
        >
          Connectable Nodes
        </Typography>
      </MenuItem>
      <Divider />
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
                <MarkdownRenderer content={nodeMetadata.description || "..."} />
              }
            />
          ))}
          <Divider />
        </React.Fragment>
      ))}
    </Menu>
  );
};

export default memo(ConnectableNodes, isEqual);
