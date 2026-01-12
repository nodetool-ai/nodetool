/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { VariableSizeList as VirtualList, ListChildComponentProps } from "react-window";
import { NodeMetadata } from "../../stores/ApiTypes";
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useStoreWithEqualityFn } from "zustand/traditional";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import isEqual from "lodash/isEqual";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
  isSearchResults?: boolean;
  selectedPath?: string;
  height?: number;
}

type ListItem =
  | { type: "header"; namespace: string; selectedPath: string }
  | { type: "api-key"; service: string }
  | { type: "node"; node: NodeMetadata };

interface RowData {
  items: ListItem[];
  isSearchResults: boolean;
  onCreateNode: (node: NodeMetadata) => void;
  onDragStart: (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => void;
}

const NODE_ITEM_HEIGHT = 44;
const HEADER_HEIGHT = 36;
const API_KEY_HEIGHT = 40;

const styles = (theme: Theme) =>
  css({
    "&": {
      height: "100%",
      width: "100%"
    },
    ".virtual-list-container": {
      height: "100%",
      width: "100%"
    },
    ".node-row": {
      display: "flex",
      alignItems: "center",
      padding: "4px 8px",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".namespace-header": {
      padding: "8px 8px 4px 8px",
      color: theme.vars.palette.text.secondary,
      fontWeight: 600,
      fontSize: "0.85rem",
      letterSpacing: "0.8px",
      textTransform: "uppercase",
      userSelect: "none",
      pointerEvents: "none"
    }
  });

const groupNodesByNamespace = (nodes: NodeMetadata[]): { [key: string]: NodeMetadata[] } => {
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

const buildListItems = (
  nodes: NodeMetadata[],
  isSearchResults: boolean,
  selectedPath: string
): ListItem[] => {
  if (isSearchResults) {
    return nodes.map((node): ListItem => ({ type: "node", node }));
  }

  const groups = groupNodesByNamespace(nodes);
  const items: ListItem[] = [];
  const seenServices = new Set<string>();

  Object.entries(groups).forEach(([namespace, nodesInNamespace]) => {
    const service = getServiceFromNamespace(namespace);
    const isFirstNamespaceForService = !seenServices.has(service);

    if (isFirstNamespaceForService) {
      seenServices.add(service);
      items.push({ type: "api-key", service });
    }

    let textForNamespaceHeader = namespace;

    if (selectedPath && selectedPath === namespace) {
      textForNamespaceHeader = namespace.split(".").pop() || namespace;
    } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
      textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
    }

    items.push({ type: "header", namespace: textForNamespaceHeader, selectedPath });

    nodesInNamespace.forEach((node) => {
      items.push({ type: "node", node });
    });
  });

  return items;
};

const getItemSize = (index: number, items: ListItem[]): number => {
  const item = items[index];
  if (item.type === "header") {
    return HEADER_HEIGHT;
  }
  if (item.type === "api-key") {
    return API_KEY_HEIGHT;
  }
  return NODE_ITEM_HEIGHT;
};

const RowRenderer: React.FC<ListChildComponentProps<RowData>> = memo(
  function RowRenderer({ index, style, data }) {
    const { items, isSearchResults, onCreateNode, onDragStart } = data;
    const item = items[index];

    if (item.type === "header") {
      return (
        <Box style={style}>
          <Typography
            variant="h5"
            component="div"
            className="namespace-header"
          >
            {item.namespace}
          </Typography>
        </Box>
      );
    }

    if (item.type === "api-key") {
      return (
        <Box style={style}>
          <ApiKeyValidation nodeNamespace={`${item.service}.`} />
        </Box>
      );
    }

    return (
      <Box style={style} className="node-row">
        {isSearchResults ? (
          <SearchResultItem
            node={item.node}
            onDragStart={onDragStart(item.node)}
            onDragEnd={() => {}}
            onClick={() => onCreateNode(item.node)}
          />
        ) : (
          <NodeItem
            node={item.node}
            onDragStart={onDragStart(item.node)}
            onClick={() => onCreateNode(item.node)}
          />
        )}
      </Box>
    );
  },
  isEqual
);

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  showCheckboxes: _showCheckboxes = false,
  selectedNodeTypes: _selectedNodeTypes = [],
  onToggleSelection: _onToggleSelection,
  showFavoriteButton: _showFavoriteButton = true,
  isSearchResults = false,
  selectedPath = "",
  height = 600
}) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => styles(theme), [theme]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(height);

  const handleCreateNode = useCreateNode();
  const setDragToCreate = useStoreWithEqualityFn(
    useNodeMenuStore,
    (state) => state.setDragToCreate,
    Object.is
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

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

  void handleDragEnd; // TODO: Use for drag end handling when react-window supports it

  const items = useMemo(
    () => buildListItems(nodes, isSearchResults, selectedPath),
    [nodes, isSearchResults, selectedPath]
  );

  const itemData = useMemo<RowData>(
    () => ({
      items,
      isSearchResults,
      onCreateNode: handleCreateNode,
      onDragStart: handleDragStart
    }),
    [items, isSearchResults, handleCreateNode, handleDragStart]
  );

  const getItemSizeCallback = useCallback(
    (index: number) => getItemSize(index, items),
    [items]
  );

  useEffect(() => {
    const updateHeight = () => {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setContainerHeight(rect.height || height);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [height]);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Box ref={containerRef} className="virtual-list-container" css={memoizedStyles}>
      <VirtualList
        style={{ height: containerHeight, width: "100%" }}
        height={containerHeight}
        width="100%"
        itemCount={items.length}
        itemSize={getItemSizeCallback}
        itemData={itemData}
        itemKey={(index) => {
          const item = items[index];
          if (item.type === "header") {
            return `header-${item.namespace}`;
          }
          if (item.type === "api-key") {
            return `apikey-${item.service}`;
          }
          return `node-${item.node.node_type}`;
        }}
        onItemsRendered={() => {}}
      >
        {RowRenderer}
      </VirtualList>
    </Box>
  );
};

export default memo(VirtualizedNodeList, isEqual);
