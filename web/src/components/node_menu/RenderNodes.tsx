import { memo, useCallback, useMemo, useRef, useLayoutEffect } from "react";
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
  const { focusedNodeIndex, hoveredNode, setHoveredNode, setDragToCreate } =
    useNodeMenuStore((state) => ({
      focusedNodeIndex: state.focusedNodeIndex,
      hoveredNode: state.hoveredNode,
      setHoveredNode: state.setHoveredNode,
      setDragToCreate: state.setDragToCreate
    }));

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

  const focusedNodeRef = useRef<HTMLDivElement>(null);

  const renderNode = useCallback(
    (node: NodeMetadata, index: number) => {
      const isHovered = hoveredNode?.node_type === node.node_type;
      const isFocused = index === focusedNodeIndex;

      return (
        <NodeItem
          key={node.node_type}
          ref={isFocused ? focusedNodeRef : undefined}
          node={node}
          isHovered={isHovered}
          isFocused={isFocused}
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
      focusedNodeIndex,
      handleMouseEnter,
      handleMouseLeave,
      onInfoClick,
      handleDragStart,
      handleCreateNode
    ]
  );

  useLayoutEffect(() => {
    if (focusedNodeRef.current) {
      focusedNodeRef.current.scrollIntoView({
        block: "nearest"
      });
    }
  }, [focusedNodeIndex]);

  const elements = useMemo(() => {
    let globalIndex = 0;
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
        ...nodesInNamespace.map((node) => {
          const element = renderNode(node, globalIndex);
          globalIndex += 1;
          return element;
        })
      ]
    );
  }, [groupedNodes, renderNode]);

  return <div className="nodes">{elements}</div>;
};

export default memo(RenderNodes, isEqual);
