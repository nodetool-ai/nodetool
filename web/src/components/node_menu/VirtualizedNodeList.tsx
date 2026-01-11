/** @jsxImportSource @emotion/react */
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { useRef, useCallback, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import ApiKeyValidation from "../node/ApiKeyValidation";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  groupedSearchResults: Array<{ namespace: string; nodes: NodeMetadata[] }>;
  searchTerm: string;
}

const NODE_ITEM_HEIGHT = 32;

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  groupedSearchResults,
  searchTerm
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  const { setDragToCreate } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate
  }));
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();

  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      setDragToCreate(true);
      serializeDragData({ type: "create-node", payload: node }, event.dataTransfer);
      event.dataTransfer.effectAllowed = "move";
      setActiveDrag({ type: "create-node", payload: node });
    },
    [setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const isSearching = searchTerm && groupedSearchResults.length > 0;

  const allNodes = useMemo(() => {
    if (isSearching) {
      return groupedSearchResults.flatMap((group) => group.nodes);
    }
    return nodes;
  }, [isSearching, groupedSearchResults, nodes]);

  const flatItems = useMemo(() => {
    if (!isSearching) {
      const items: Array<{
        type: "header" | "apikey" | "node";
        node?: NodeMetadata;
        namespace?: string;
        namespaceIndex?: number;
      }> = [];
      const seenServices = new Set<string>();

      Object.entries(
        allNodes.reduce<Record<string, NodeMetadata[]>>((acc, node) => {
          if (!acc[node.namespace]) {
            acc[node.namespace] = [];
          }
          acc[node.namespace].push(node);
          return acc;
        }, {})
      ).forEach(([namespace, nodesInNamespace], namespaceIndex) => {
        const service = namespace.split(".")[0];
        const isFirstNamespaceForService = !seenServices.has(service);
        seenServices.add(service);

        if (isFirstNamespaceForService) {
          items.push({
            type: "apikey",
            namespace,
            namespaceIndex
          });
        }

        items.push({
          type: "header",
          namespace,
          namespaceIndex
        });

        nodesInNamespace.forEach((node) => {
          items.push({
            type: "node",
            node
          });
        });
      });

      return items;
    }

    return allNodes.map((node) => ({
      type: "node" as const,
      node
    }));
  }, [isSearching, allNodes]);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => NODE_ITEM_HEIGHT,
    overscan: 5
  });

  const renderItem = useCallback(
    (index: number) => {
      const item = flatItems[index];

      if (item.type === "apikey") {
        return (
          <ApiKeyValidation
            key={`api-key-${item.namespace}-${item.namespaceIndex}`}
            nodeNamespace={item.namespace || ""}
          />
        );
      }

      if (item.type === "header") {
        return (
          <Typography
            key={`namespace-${item.namespace}-${item.namespaceIndex}`}
            variant="h5"
            component="div"
            className="namespace-text"
            sx={{
              px: 1,
              py: 0.5,
              fontWeight: 600,
              fontSize: "0.75rem",
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}
          >
            {item.namespace}
          </Typography>
        );
      }

      if (item.type === "node" && item.node) {
        const node = item.node;
        if (isSearching) {
          return (
            <SearchResultItem
              key={node.node_type}
              node={node}
              onDragStart={handleDragStart(node)}
              onDragEnd={handleDragEnd}
              onClick={() => handleCreateNode(node)}
            />
          );
        }
        return (
          <NodeItem
            key={node.node_type}
            node={node}
            onDragStart={handleDragStart(node)}
            onClick={() => handleCreateNode(node)}
          />
        );
      }

      return null;
    },
    [flatItems, isSearching, handleDragStart, handleDragEnd, handleCreateNode]
  );

  const totalHeight = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  if (allNodes.length === 0) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2
        }}
      >
        <Box className="no-selection">
          <Box className="explanation">
            <Typography variant="h5" sx={{ marginTop: 0 }}>
              Browse Nodes
            </Typography>
            <ul>
              <li>Click on the namespaces to the left</li>
            </ul>

            <Typography variant="h5">Search Nodes</Typography>
            <ul>
              <li>Type in the search bar to search for nodes.</li>
            </ul>

            <Typography variant="h5">Create Nodes</Typography>
            <ul>
              <li>Click on a node</li>
              <li>Drag a node onto the canvas</li>
            </ul>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={listRef}
      sx={{
        height: "100%",
        overflowY: "auto",
        contain: "strict"
      }}
    >
      <Box
        sx={{
          height: totalHeight,
          width: "100%",
          position: "relative"
        }}
      >
        {virtualItems.map((virtualRow) => {
          const itemIndex = virtualRow.index;
          const item = flatItems[itemIndex];
          const isApikey = item.type === "apikey";
          const isHeader = item.type === "header";

          return (
            <Box
              key={virtualRow.index}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
                px: 0.5,
                ...(isApikey && {
                  px: 1,
                  py: 0.5
                }),
                ...(isHeader && {
                  px: 1,
                  py: 0.5
                })
              }}
            >
              {renderItem(itemIndex)}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default VirtualizedNodeList;
