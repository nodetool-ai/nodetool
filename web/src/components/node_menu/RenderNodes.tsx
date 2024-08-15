/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback, useMemo, useRef } from "react";
// mui
import { ListItemButton, ListItemText, Typography } from "@mui/material";
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import { iconForType } from "../../config/data_types";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useDelayedHover } from "../../hooks/useDelayedHover";
import { titleize } from "../node/BaseNode";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  hoverDelay?: number;
}

interface NodeItemProps {
  node: NodeMetadata;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
}

const nodeStyles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: "0",
      padding: "0.025em",
      borderRadius: "3px",
      cursor: "pointer",
      ".node-button": {
        padding: ".2em .5em"
      }
    },
    ".node.hovered": {
      color: theme.palette.c_hl1
    }
  });

const NodeItem: React.FC<NodeItemProps> = memo(({
  node,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onClick
}: NodeItemProps) => {
  const outputType = node.outputs.length > 0 ? node.outputs[0].type.type : "";

  return (
    <div
      className={`node ${isHovered ? "hovered" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      draggable
      onDragStart={onDragStart}
    >
      {iconForType(outputType, {
        fill: "#fff",
        containerStyle: {
          borderRadius: "0 0 3px 0",
          marginLeft: "0.1em",
          marginTop: "0"
        },
        bgStyle: {
          backgroundColor: "#333",
          margin: "0",
          padding: "1px",
          borderRadius: "0 0 3px 0",
          boxShadow: "inset 1px 1px 2px #00000044",
          width: "20px",
          height: "20px"
        },
        width: "15px",
        height: "15px"
      })}
      <ListItemButton className="node-button" onClick={onClick}>
        <ListItemText
          primary={
            <Typography fontSize="small">
              {titleize(node.node_type.split(".").pop() || "")}
            </Typography>
          }
        />
      </ListItemButton>
    </div>
  );
});

const groupNodes = (nodes: NodeMetadata[]) => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach(node => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });
  return groups;
};


const RenderNodes: React.FC<RenderNodesProps> = ({ nodes, hoverDelay = 150 }) => {
  const { hoveredNode, setHoveredNode, setDragToCreate } = useNodeMenuStore(
    (state) => ({
      hoveredNode: state.hoveredNode,
      setHoveredNode: state.setHoveredNode,
      setDragToCreate: state.setDragToCreate
    })
  );

  const handleCreateNode = useCreateNode();

  const currentHoveredNodeRef = useRef<NodeMetadata | null>(null);

  const { handleMouseEnter, handleMouseLeave } = useDelayedHover(
    useCallback(() => {
      if (currentHoveredNodeRef.current) {
        setHoveredNode(currentHoveredNodeRef.current);
      }
    }, [setHoveredNode]),
    hoverDelay
  );

  const handleDragStart = useCallback((node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
    setDragToCreate(true);
    event.dataTransfer.setData("create-node", JSON.stringify(node));
    event.dataTransfer.effectAllowed = "move";
  }, [setDragToCreate]);

  const groupedNodes = useMemo(() => groupNodes(nodes), [nodes]);

  const renderNode = useCallback((node: NodeMetadata) => {
    const isHovered = hoveredNode?.node_type === node.node_type;

    return (
      <NodeItem
        key={`${node.namespace}-${node.title}`}
        node={node}
        isHovered={isHovered}
        onMouseEnter={() => {
          currentHoveredNodeRef.current = node;
          handleMouseEnter();
        }}
        onMouseLeave={() => {
          currentHoveredNodeRef.current = null;
          handleMouseLeave();
        }}
        onDragStart={handleDragStart(node)}
        onClick={() => handleCreateNode(node)}
      />
    );
  }, [hoveredNode, handleMouseEnter, handleMouseLeave, handleDragStart, handleCreateNode]);

  const elements = useMemo(() => {
    return Object.entries(groupedNodes).flatMap(([namespace, nodesInNamespace]) => [
      <Typography
        key={`namespace-${namespace}`}
        variant="h5"
        component="div"
        sx={{ my: 2, color: "#888" }}
      >
        {namespace}
      </Typography>,
      ...nodesInNamespace.map(renderNode)
    ]);
  }, [groupedNodes, renderNode]);

  return (
    <div className="nodes" css={nodeStyles}>
      {elements}
    </div>
  );
};

export default RenderNodes;