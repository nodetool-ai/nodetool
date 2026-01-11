/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NodeMetadata } from "../../stores/ApiTypes";
import ApiKeyValidation from "../node/ApiKeyValidation";
import NodeItem from "./NodeItem";
import isEqual from "lodash/isEqual";
import { NODE_ITEM_HEIGHT, NODE_ITEM_OVERSCAN } from "../../hooks/useVirtualizedNodes";

interface VirtualNamespaceListProps {
  nodes: NodeMetadata[];
  containerRef: React.RefObject<HTMLDivElement>;
  selectedPath: string;
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

interface NamespaceGroup {
  namespace: string;
  nodes: NodeMetadata[];
  isFirstForService: boolean;
}

const getServiceFromNamespace = (namespace: string): string => {
  const parts = namespace.split(".");
  return parts[0];
};

const groupNodesByNamespace = (
  nodes: NodeMetadata[],
  selectedPath: string
): NamespaceGroup[] => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });

  const seenServices = new Set<string>();
  const result: NamespaceGroup[] = [];

  Object.entries(groups).forEach(([namespace, nodesInNamespace]) => {
    const service = getServiceFromNamespace(namespace);
    const isFirstForService = !seenServices.has(service);
    seenServices.add(service);

    let textForNamespaceHeader = namespace;

    if (selectedPath && selectedPath === namespace) {
      textForNamespaceHeader = namespace.split(".").pop() || namespace;
    } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
      textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
    }

    result.push({
      namespace: textForNamespaceHeader,
      nodes: nodesInNamespace,
      isFirstForService
    });
  });

  return result;
};

const NAMESPACE_HEADER_HEIGHT = 32;

const VirtualNamespaceList: React.FC<VirtualNamespaceListProps> = ({
  nodes,
  containerRef,
  selectedPath,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  showFavoriteButton = true
}) => {
  const groupedNodes = useMemo(
    () => groupNodesByNamespace(nodes, selectedPath),
    [nodes, selectedPath]
  );

  const calculateItemSize = useCallback(
    (index: number): number => {
      const group = groupedNodes[index];
      return NAMESPACE_HEADER_HEIGHT + group.nodes.length * NODE_ITEM_HEIGHT;
    },
    [groupedNodes]
  );

  const count = groupedNodes.length;
  const overscan = NODE_ITEM_OVERSCAN;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: calculateItemSize,
    overscan,
    enabled: count > 10
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <Box
      ref={containerRef}
      sx={{
        height: "100%",
        overflowY: "auto",
        width: "100%"
      }}
    >
      <Box
        sx={{
          height: `${totalSize}px`,
          width: "100%",
          position: "relative"
        }}
      >
        {items.map((virtualItem) => {
          const group = groupedNodes[virtualItem.index];
          let currentOffset = virtualItem.start;

          const elements: React.ReactNode[] = [];

          if (group.isFirstForService) {
            const originalNamespace = Object.keys(
              groupedNodes.reduce((acc, g) => {
                const fullNamespace = nodes.find((n) => n.namespace === g.namespace)?.namespace || "";
                if (g.namespace.startsWith(fullNamespace.split(".")[0])) {
                  acc[fullNamespace] = true;
                }
                return acc;
              }, {} as Record<string, boolean>)
            ).find((ns) => ns.startsWith(group.namespace.split(".")[0]));

            elements.push(
              <ApiKeyValidation
                key={`api-key-${group.namespace}-${virtualItem.index}`}
                nodeNamespace={originalNamespace || group.namespace}
              />
            );
            currentOffset += 24;
          }

          elements.push(
            <Typography
              key={`namespace-${group.namespace}-${virtualItem.index}`}
              variant="h5"
              component="div"
              className="namespace-text"
              sx={{
                height: NAMESPACE_HEADER_HEIGHT,
                lineHeight: `${NAMESPACE_HEADER_HEIGHT}px`
              }}
            >
              {group.namespace}
            </Typography>
          );
          currentOffset += NAMESPACE_HEADER_HEIGHT;

          group.nodes.forEach((node) => {
            elements.push(
              <Box
                key={node.node_type}
                sx={{
                  height: NODE_ITEM_HEIGHT,
                  position: "absolute",
                  top: currentOffset,
                  left: 0,
                  width: "100%"
                }}
              >
                <NodeItem
                  node={node}
                  onClick={() => {}}
                  onDragStart={() => {}}
                  showCheckbox={showCheckboxes}
                  isSelected={selectedNodeTypes.includes(node.node_type)}
                  onToggleSelection={onToggleSelection}
                  showFavoriteButton={showFavoriteButton}
                />
              </Box>
            );
            currentOffset += NODE_ITEM_HEIGHT;
          });

          return (
            <Box
              key={virtualItem.key}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              {elements}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default memo(VirtualNamespaceList, isEqual);
