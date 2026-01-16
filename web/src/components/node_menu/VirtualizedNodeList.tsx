/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Box, Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import useNodeMenuStore from "../../stores/NodeMenuStore";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  isSearchMode: boolean;
  searchTerm: string;
}

const groupNodes = (nodes: NodeMetadata[]): { namespace: string; nodes: NodeMetadata[] }[] => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });
  return Object.entries(groups).map(([namespace, nodesInGroup]) => ({
    namespace,
    nodes: nodesInGroup
  }));
};

const getServiceFromNamespace = (namespace: string): string => {
  const parts = namespace.split(".");
  return parts[0];
};

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  isSearchMode,
  searchTerm
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const { setDragToCreate, groupedSearchResults } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    groupedSearchResults: state.groupedSearchResults
  }));

  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const selectedPath = useNodeMenuStore((state) => state.selectedPath.join("."));

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

  const searchNodes = isSearchMode && groupedSearchResults.length > 0
    ? groupedSearchResults.flatMap((group) => group.nodes)
    : null;

  const flatNodes = useCallback((): { type: "header" | "node"; content: React.ReactNode; height: number }[] => {
    if (searchNodes && searchNodes.length > 0) {
      return searchNodes.map((node) => ({
        type: "node" as const,
        height: 48,
        content: (
          <SearchResultItem
            key={node.node_type}
            node={node}
            onDragStart={handleDragStart(node)}
            onDragEnd={handleDragEnd}
            onClick={() => handleCreateNode(node)}
          />
        )
      }));
    }

    const groups = groupNodes(nodes);
    const result: { type: "header" | "node"; content: React.ReactNode; height: number }[] = [];
    const seenServices = new Set<string>();

    groups.forEach(({ namespace, nodes: nodesInNamespace }, namespaceIndex) => {
      const service = getServiceFromNamespace(namespace);
      const isFirstNamespaceForService = !seenServices.has(service);
      seenServices.add(service);

      if (isFirstNamespaceForService) {
        result.push({
          type: "header",
          height: 36,
          content: (
            <ApiKeyValidation
              key={`api-key-${service}-${namespaceIndex}`}
              nodeNamespace={namespace}
            />
          )
        });
      }

      let textForNamespaceHeader = namespace;
      if (selectedPath && selectedPath === namespace) {
        textForNamespaceHeader = namespace.split(".").pop() || namespace;
      } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
        textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
      }

      result.push({
        type: "header",
        height: 36,
        content: (
          <Typography
            key={`namespace-${namespace}-${namespaceIndex}`}
            variant="h5"
            component="div"
            className="namespace-text"
          >
            {textForNamespaceHeader}
          </Typography>
        )
      });

      nodesInNamespace.forEach((node: NodeMetadata) => {
        result.push({
          type: "node" as const,
          height: 40,
          content: (
            <div key={node.node_type}>
              <NodeItem
                key={node.node_type}
                node={node}
                onDragStart={handleDragStart(node)}
                onClick={() => handleCreateNode(node)}
              />
            </div>
          )
        });
      });
    });

    return result;
  }, [searchNodes, nodes, selectedPath, handleDragStart, handleDragEnd, handleCreateNode]);

  const items = flatNodes();

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => items[index]?.height ?? 40, [items]),
    overscan: 5
  });

  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = 0;
    }
  }, [nodes, searchTerm]);

  const styles = css`
    & {
      height: 100%;
      overflow-y: auto;
      width: 100%;
    }
    .virtual-row {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      display: flex;
      align-items: center;
    }
    .virtual-row-content {
      width: 100%;
    }
  `;

  if (nodes.length === 0) {
    return (
      <div className="no-selection" css={css`
        padding: 1em;
        max-width: 400px;
      `}>
        <Typography variant="h5" style={{ marginTop: 0 }}>
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
      </div>
    );
  }

  return (
    <Box ref={parentRef} css={styles} className="virtualized-node-list">
      <Box
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: "100%",
          position: "relative"
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <Box
              key={virtualItem.index}
              className="virtual-row"
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              <Box className="virtual-row-content">{item.content}</Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default memo(VirtualizedNodeList);
