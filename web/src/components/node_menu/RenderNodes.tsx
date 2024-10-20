import { memo, useCallback, useMemo, useRef } from "react";
// mui
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import { useCreateNode } from "../../hooks/useCreateNode";
import { useDelayedHover } from "../../hooks/useDelayedHover";
import NodeItem from "./NodeItem";
import { Typography } from "@mui/material";
import { isEqual } from "lodash";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  hoverDelay?: number;
}
const groupNodes = (nodes: NodeMetadata[]) => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });
  return groups;
};

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  hoverDelay = 400
}) => {
  const { hoveredNode, setHoveredNode, setDragToCreate } = useNodeMenuStore(
    (state) => ({
      hoveredNode: state.hoveredNode,
      setHoveredNode: state.setHoveredNode,
      setDragToCreate: state.setDragToCreate
    })
  );

  const handleCreateNode = useCreateNode();
  const currentHoveredNodeRef = useRef<NodeMetadata | null>(null);
  const onInfoClick = useCallback(() => {
    setHoveredNode(currentHoveredNodeRef.current);
  }, [setHoveredNode]);

  const { handleMouseEnter, handleMouseLeave } = useDelayedHover(
    useCallback(() => {
      if (currentHoveredNodeRef.current) {
        setHoveredNode(currentHoveredNodeRef.current);
      }
    }, [setHoveredNode]),
    hoverDelay
  );

  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      setDragToCreate(true);
      event.dataTransfer.setData("create-node", JSON.stringify(node));
      event.dataTransfer.effectAllowed = "move";
    },
    [setDragToCreate]
  );

  const groupedNodes = useMemo(() => groupNodes(nodes), [nodes]);

  const renderNode = useCallback(
    (node: NodeMetadata) => {
      const isHovered = hoveredNode?.node_type === node.node_type;

      return (
        <NodeItem
          key={node.node_type}
          node={node}
          isHovered={isHovered}
          onInfoClick={onInfoClick}
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
    },
    [
      hoveredNode,
      handleMouseEnter,
      handleMouseLeave,
      onInfoClick,
      handleDragStart,
      handleCreateNode
    ]
  );

  const elements = useMemo(() => {
    return Object.entries(groupedNodes).flatMap(
      ([namespace, nodesInNamespace]) => [
        <Typography
          key={`namespace-${namespace}`}
          variant="h5"
          component="div"
          className="namespace-text"
        >
          {namespace}
        </Typography>,
        ...nodesInNamespace.map(renderNode)
      ]
    );
  }, [groupedNodes, renderNode]);

  return <div className="nodes">{elements}</div>;
};

export default memo(RenderNodes, isEqual);
