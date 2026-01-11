/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeItem from "./NodeItem";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as VirtualList, ListChildComponentProps } from "react-window";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  height?: number;
  width?: number;
}

interface FlattenedNodeItem {
  type: "header" | "node" | "apikey";
  node?: NodeMetadata;
  namespace?: string;
  namespaceIndex?: number;
  service?: string;
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

const itemSize = 40;

const nodeListStyles = (theme: Theme) =>
  css({
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: "0",
      padding: "4px",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      border: "1px solid transparent",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        border: `1px solid ${theme.vars.palette.divider}`,
        transform: "translateX(2px)"
      }
    },
    ".namespace-text": {
      color: theme.vars.palette.text.secondary,
      fontWeight: 600,
      fontSize: "0.85rem",
      padding: "1em 0.5em 0.5em 0.5em",
      letterSpacing: "0.8px",
      wordBreak: "break-word",
      userSelect: "none",
      textTransform: "uppercase",
      backgroundColor: theme.vars.palette.background.paper,
      position: "sticky",
      top: 0,
      zIndex: 1
    },
    ".api-key-validation": {
      padding: "0.5em"
    }
  });

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  height: propHeight,
  width: propWidth
}) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => nodeListStyles(theme), [theme]);

  const { setDragToCreate, groupedSearchResults, searchTerm, selectedPath } =
    useNodeMenuStore((state) => ({
      setDragToCreate: state.setDragToCreate,
      groupedSearchResults: state.groupedSearchResults,
      searchTerm: state.searchTerm,
      selectedPath: state.selectedPath.join(".")
    }));

  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const listRef = useRef<VirtualList>(null);

  const handleCreateNode = useCreateNode();

  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: node },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "move";
      setActiveDrag({ type: "create-node", payload: node });
    },
    [setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  void handleDragEnd;

  const flattenedItems = useMemo((): FlattenedNodeItem[] => {
    if (searchTerm && groupedSearchResults.length > 0) {
      return [];
    }

    const seenServices = new Set<string>();
    const items: FlattenedNodeItem[] = [];

    Object.entries(groupNodes(nodes)).forEach(
      ([namespace, nodesInNamespace], namespaceIndex) => {
        const service = getServiceFromNamespace(namespace);
        const isFirstNamespaceForService = !seenServices.has(service);
        seenServices.add(service);

        if (isFirstNamespaceForService) {
          items.push({
            type: "apikey",
            service,
            namespaceIndex
          });
        }

        let textForNamespaceHeader = namespace;

        if (selectedPath && selectedPath === namespace) {
          textForNamespaceHeader = namespace.split(".").pop() || namespace;
        } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
          textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
        }

        items.push({
          type: "header",
          namespace: textForNamespaceHeader,
          namespaceIndex
        });

        nodesInNamespace.forEach((node) => {
          items.push({
            type: "node",
            node
          });
        });
      }
    );

    return items;
  }, [nodes, searchTerm, groupedSearchResults, selectedPath]);

  const renderRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const item = flattenedItems[index];

      if (!item) {
        return null;
      }

      const itemStyle = {
        ...style,
        top: (style.top as number) + (index === 0 ? 0 : 0)
      };

      if (item.type === "header") {
        return (
          <div style={itemStyle} css={memoizedStyles}>
            <Typography
              variant="h5"
              component="div"
              className="namespace-text"
            >
              {item.namespace}
            </Typography>
          </div>
        );
      }

      if (item.type === "apikey" && item.namespaceIndex !== undefined) {
        return (
          <div style={itemStyle} css={memoizedStyles} className="api-key-validation">
            <ApiKeyValidation
              key={`api-key-${item.service}-${item.namespaceIndex}`}
              nodeNamespace={Object.keys(groupNodes(nodes))[item.namespaceIndex] || ""}
            />
          </div>
        );
      }

      if (item.type === "node" && item.node) {
        return (
          <div style={itemStyle} css={memoizedStyles}>
            <NodeItem
              key={item.node.node_type}
              node={item.node}
              onDragStart={handleDragStart(item.node)}
              onClick={() => handleCreateNode(item.node!)}
            />
          </div>
        );
      }

      return null;
    },
    [flattenedItems, nodes, handleDragStart, handleCreateNode, memoizedStyles]
  );

  const totalHeight = useMemo(() => {
    return flattenedItems.length * itemSize;
  }, [flattenedItems]);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div css={memoizedStyles} className="virtualized-node-list">
      <AutoSizer>
        {({ height: autoHeight, width: autoWidth }) => {
          const safeHeight = propHeight || autoHeight || 400;
          const safeWidth = propWidth || autoWidth || 300;
          const listHeight = Math.min(safeHeight, totalHeight + 20);

          return (
            <VirtualList
              ref={listRef}
              height={listHeight}
              width={safeWidth}
              itemCount={flattenedItems.length}
              itemSize={itemSize}
              style={{ overflowX: "hidden" }}
            >
              {renderRow}
            </VirtualList>
          );
        }}
      </AutoSizer>
    </div>
  );
};

export default memo(VirtualizedNodeList, isEqual);
