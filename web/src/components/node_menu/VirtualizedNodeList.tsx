/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NodeMetadata } from "../../stores/ApiTypes";
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { Typography } from "@mui/material";
import { useNodeMenuStore } from "../../stores/NodeMenuStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  isSearchResults?: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

type ListItem = {
  id: string;
  type: "node" | "header" | "apikey";
  node: NodeMetadata;
};

const getServiceFromNamespace = (namespace: string): string => {
  const parts = namespace.split(".");
  return parts[0];
};

const styles = css({
  "&": {
    width: "100%",
    height: "100%"
  },
  ".virtualized-list": {
    position: "relative"
  }
});

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  isSearchResults = false,
  containerRef
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  const { groupedSearchResults, searchTerm } = useNodeMenuStore((state) => ({
    groupedSearchResults: state.groupedSearchResults,
    searchTerm: state.searchTerm
  }));

  const handleCreateNode = useCreateNode();
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      serializeDragData(
        { type: "create-node", payload: node },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "move";
      setActiveDrag({ type: "create-node", payload: node });
    },
    [setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  const allItems = useMemo(() => {
    if (isSearchResults && searchTerm && groupedSearchResults.length > 0) {
      const searchNodes = groupedSearchResults.flatMap((group) => group.nodes);
      return searchNodes.map((node) => ({
        id: node.node_type,
        type: "node" as const,
        node
      }));
    }

    if (!isSearchResults) {
      const groups = new Map<string, NodeMetadata[]>();
      nodes.forEach((node) => {
        const existing = groups.get(node.namespace) || [];
        groups.set(node.namespace, [...existing, node]);
      });

      const items: ListItem[] = [];
      const seenServices = new Set<string>();

      groups.forEach((nodesInNamespace, namespace) => {
        const service = getServiceFromNamespace(namespace);
        const isFirstNamespaceForService = !seenServices.has(service);

        if (isFirstNamespaceForService) {
          seenServices.add(service);
          items.push({
            id: `apikey-${service}`,
            type: "apikey",
            node: {
              node_type: `__apikey__${service}`,
              namespace,
              description: "",
              title: "",
              layout: "default",
              properties: [],
              outputs: [],
              the_model_info: {},
              recommended_models: [],
              basic_fields: [],
              is_dynamic: false,
              is_streaming_output: false,
              expose_as_tool: false,
              supports_dynamic_outputs: false
            }
          });
        }

        items.push({
          id: `header-${namespace}`,
          type: "header",
          node: {
            node_type: `__header__${namespace}`,
            namespace,
            description: "",
            title: "",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }
        });

        nodesInNamespace.forEach((node) => {
          items.push({
            id: node.node_type,
            type: "node",
            node
          });
        });
      });

      return items;
    }

    return nodes.map((node) => ({
      id: node.node_type,
      type: "node" as const,
      node
    }));
  }, [nodes, isSearchResults, searchTerm, groupedSearchResults]);

  const itemCount = allItems.length;

  const estimateSize = useCallback(() => {
    return 48;
  }, []);

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => containerRef.current || listRef.current,
    estimateSize,
    overscan: 5
  });

  const renderItem = useCallback((item: ListItem): React.ReactNode => {
    if (item.type === "apikey") {
      return <ApiKeyValidation key={item.id} nodeNamespace={item.node.namespace} />;
    }

    if (item.type === "header") {
      const textForNamespaceHeader = (() => {
        if (selectedPath && selectedPath === item.node.namespace) {
          return item.node.namespace.split(".").pop() || item.node.namespace;
        } else if (selectedPath && item.node.namespace.startsWith(selectedPath + ".")) {
          return item.node.namespace.substring(selectedPath.length + 1);
        }
        return item.node.namespace;
      })();

      return (
        <Typography
          variant="h5"
          component="div"
          className="namespace-text"
          key={item.id}
        >
          {textForNamespaceHeader}
        </Typography>
      );
    }

    if (isSearchResults) {
      return (
        <SearchResultItem
          key={item.node.node_type}
          node={item.node}
          onDragStart={handleDragStart(item.node)}
          onDragEnd={handleDragEnd}
          onClick={() => handleCreateNode(item.node)}
        />
      );
    }

    return (
      <NodeItem
        key={item.node.node_type}
        node={item.node}
        onDragStart={handleDragStart(item.node)}
        onClick={() => handleCreateNode(item.node)}
      />
    );
  }, [isSearchResults, selectedPath, handleDragStart, handleDragEnd, handleCreateNode]);

  if (itemCount === 0) {
    return null;
  }

  return (
    <div css={styles} className="virtualized-list" ref={listRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative"
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = allItems[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              {item && renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualizedNodeList;
