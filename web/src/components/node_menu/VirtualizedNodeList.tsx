/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NodeMetadata } from "../../stores/ApiTypes";
import NodeItem from "./NodeItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";
import useNodeMenuStore from "../../stores/NodeMenuStore";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  searchTerm?: string;
  selectedPath?: string;
  onNodeClick?: (node: NodeMetadata) => void;
  onDragStart?: (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  showFavoriteButton?: boolean;
  itemHeight?: number;
  overscan?: number;
}

const nodeItemHeight = 36;
const namespaceHeaderHeight = 32;

const styles = (theme: Theme) =>
  css({
    "&": {
      height: "100%",
      width: "100%",
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".virtual-list-container": {
      position: "relative",
      height: "100%",
      width: "100%"
    },
    ".virtual-list-item": {
      position: "absolute",
      width: "100%",
      left: 0
    },
    ".namespace-text": {
      color: theme.vars.palette.text.secondary,
      fontWeight: 600,
      fontSize: "0.85rem",
      padding: "0.5em 0.75em 0.25em 0.75em",
      letterSpacing: "0.8px",
      wordBreak: "break-word",
      userSelect: "none",
      textTransform: "uppercase"
    },
    ".node-item-wrapper": {
      padding: "2px 0"
    }
  });

interface FlattenedNode {
  type: "namespace-header" | "node" | "api-key";
  key: string;
  index: number;
  data: {
    namespace?: string;
    node?: NodeMetadata;
    namespaceIndex?: number;
    service?: string;
    textForNamespaceHeader?: string;
  };
}

const groupNodes = (nodes: NodeMetadata[]): { [key: string]: NodeMetadata[] } => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });
  return groups;
};

const getServiceFromNamespace = (namespace: string): string => {
  const parts = namespace.split(".");
  return parts[0];
};

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  searchTerm: _searchTerm,
  selectedPath = "",
  onNodeClick,
  onDragStart,
  onDragEnd,
  showFavoriteButton = true,
  itemHeight = nodeItemHeight,
  overscan = 5
}) => {
  const theme = useTheme();
  const listRef = useRef<HTMLDivElement>(null);

  const memoizedStyles = useMemo(() => styles(theme), [theme]);

  const selectedIndex = useNodeMenuStore((state) => state.selectedIndex);
  const groupedSearchResults = useNodeMenuStore((state) => state.groupedSearchResults);

  const flattenNodes = useCallback((): FlattenedNode[] => {
    if (!nodes || nodes.length === 0) {
      return [];
    }

    const result: FlattenedNode[] = [];
    const groups = groupNodes(nodes);
    const seenServices = new Set<string>();
    let namespaceIndex = 0;
    let flatIndex = 0;

    for (const [namespace, nodesInNamespace] of Object.entries(groups)) {
      const service = getServiceFromNamespace(namespace);
      const isFirstNamespaceForService = !seenServices.has(service);
      if (isFirstNamespaceForService) {
        seenServices.add(service);
      }

      let textForNamespaceHeader = namespace;
      if (selectedPath && selectedPath === namespace) {
        textForNamespaceHeader = namespace.split(".").pop() || namespace;
      } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
        textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
      }

      if (isFirstNamespaceForService) {
        result.push({
          type: "api-key",
          key: `api-key-${service}-${namespaceIndex}`,
          index: flatIndex++,
          data: { namespace, service, namespaceIndex }
        });
      }

      result.push({
        type: "namespace-header",
        key: `namespace-${namespace}-${namespaceIndex}`,
        index: flatIndex++,
        data: { namespace, textForNamespaceHeader }
      });

      for (const node of nodesInNamespace) {
        result.push({
          type: "node",
          key: `node-${node.node_type}`,
          index: flatIndex++,
          data: { node, namespace }
        });
      }

      namespaceIndex++;
    }

    return result;
  }, [nodes, selectedPath]);

  const flatItems = useMemo(() => flattenNodes(), [flattenNodes]);

  const getItemHeight = useCallback(
    (index: number): number => {
      const item = flatItems[index];
      if (!item) {
        return itemHeight;
      }
      if (item.type === "namespace-header") {
        return namespaceHeaderHeight;
      }
      return itemHeight;
    },
    [flatItems, itemHeight]
  );

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: getItemHeight,
    overscan
  });

  const getFlatIndexFromSelectedIndex = useCallback((selectedIdx: number): number => {
    if (groupedSearchResults.length === 0) {
      return -1;
    }
    const flatNodes = groupedSearchResults.flatMap((g) => g.nodes);
    if (selectedIdx < 0 || selectedIdx >= flatNodes.length) {
      return -1;
    }
    const selectedNode = flatNodes[selectedIdx];
    const flatItem = flatItems.find((item) => item.type === "node" && item.data.node?.node_type === selectedNode?.node_type);
    return flatItem?.index ?? -1;
  }, [groupedSearchResults, flatItems]);

  useEffect(() => {
    if (rowVirtualizer && flatItems.length > 0) {
      rowVirtualizer.measure();
    }
  }, [flatItems.length, rowVirtualizer]);

  useEffect(() => {
    if (selectedIndex >= 0 && rowVirtualizer) {
      const flatIndex = getFlatIndexFromSelectedIndex(selectedIndex);
      if (flatIndex >= 0 && flatIndex < flatItems.length) {
        rowVirtualizer.scrollToIndex(flatIndex, { align: "auto" });
      }
    }
  }, [selectedIndex, flatItems.length, getFlatIndexFromSelectedIndex, rowVirtualizer]);

  const handleItemClick = useCallback(
    (node: NodeMetadata) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  const handleDragStartFactory = useCallback(
    (node: NodeMetadata): ((event: React.DragEvent<HTMLDivElement>) => void) | undefined => {
      return onDragStart ? onDragStart(node) : undefined;
    },
    [onDragStart]
  );

  if (nodes.length === 0) {
    return (
      <div css={memoizedStyles} className="virtual-list-container">
        <div className="no-selection">
          <div className="explanation">
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
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} css={memoizedStyles} className="virtual-list-container">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative"
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = flatItems[virtualItem.index];
          if (!item) {
            return null;
          }

          return (
            <div
              key={item.key}
              className="virtual-list-item"
              style={{
                top: virtualItem.start,
                height: `${virtualItem.size}px`
              }}
            >
              {item.type === "api-key" && item.data.service && (
                <ApiKeyValidation
                  key={item.key}
                  nodeNamespace={item.data.namespace || ""}
                />
              )}
              {item.type === "namespace-header" && (
                <Typography
                  variant="h5"
                  component="div"
                  className="namespace-text"
                >
                  {item.data.textForNamespaceHeader}
                </Typography>
              )}
              {item.type === "node" && item.data.node && (
                <div className="node-item-wrapper">
                  <NodeItem
                    key={item.key}
                    node={item.data.node!}
                    onDragStart={handleDragStartFactory(item.data.node!) ?? (() => {})}
                    onDragEnd={onDragEnd}
                    onClick={() => handleItemClick(item.data.node!)}
                    showFavoriteButton={showFavoriteButton}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(VirtualizedNodeList, isEqual);
