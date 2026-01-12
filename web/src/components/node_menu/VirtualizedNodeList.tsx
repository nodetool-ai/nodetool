/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NodeMetadata } from "../../stores/ApiTypes";
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import isEqual from "lodash/isEqual";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  isSearchResults?: boolean;
  showFavoriteButton?: boolean;
}

interface NodeGroup {
  namespace: string;
  nodes: NodeMetadata[];
  isFirstForService: boolean;
}

const groupNodes = (nodes: NodeMetadata[]): NodeGroup[] => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  const seenServices = new Set<string>();

  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });

  return Object.entries(groups).map(([namespace, nodesInNamespace]) => {
    const service = namespace.split(".")[0];
    const isFirstForService = !seenServices.has(service);
    if (isFirstForService) {
      seenServices.add(service);
    }
    return { namespace, nodes: nodesInNamespace, isFirstForService };
  });
};

const virtualizedStyles = (theme: Theme) =>
  css({
    "&": {
      height: "100%",
      display: "flex",
      flexDirection: "column"
    },
    ".virtual-container": {
      flex: 1,
      overflowY: "auto",
      contain: "strict"
    },
    ".virtual-item": {
      padding: "2px 0.5em"
    },
    ".namespace-header": {
      padding: "0.5em 0.5em 0.25em 0.5em",
      fontSize: "0.85rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      userSelect: "none",
      position: "sticky",
      top: 0,
      zIndex: 1,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".node-wrapper": {
      marginBottom: "2px"
    },
    ".no-results": {
      padding: "2em",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.9rem"
    }
  });

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  isSearchResults = false,
  showFavoriteButton = true
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const { setDragToCreate, selectedPath } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    selectedPath: state.selectedPath.join(".")
  }));

  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

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

  const groupedNodes = useMemo(() => groupNodes(nodes), [nodes]);

  const flatItems = useMemo(() => {
    const items: Array<{
      type: "header" | "apikey" | "node";
      node?: NodeMetadata;
      namespace?: string;
      isFirstForService?: boolean;
      groupIndex?: number;
    }> = [];

    groupedNodes.forEach((group, groupIndex) => {
      if (group.isFirstForService) {
        items.push({
          type: "apikey",
          namespace: group.namespace,
          groupIndex
        });
      }
      items.push({
        type: "header",
        namespace: group.namespace,
        groupIndex
      });
      group.nodes.forEach((node) => {
        items.push({
          type: "node",
          node,
          groupIndex
        });
      });
    });

    return items;
  }, [groupedNodes]);

  const estimateSize = useCallback((index: number) => {
    const item = flatItems[index];
    if (item?.type === "header") {
      return 32;
    }
    if (item?.type === "apikey") {
      return 0;
    }
    return 40;
  }, [flatItems]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize,
    overscan: 5
  });

  const renderItem = useCallback(
    (index: number) => {
      const item = flatItems[index];
      if (!item) {
        return null;
      }

      if (item.type === "apikey") {
        return (
          <ApiKeyValidation
            key={`apikey-${item.namespace}`}
            nodeNamespace={item.namespace || ""}
          />
        );
      }

      if (item.type === "header") {
        const displayText = selectedPath && selectedPath === item.namespace
          ? (item.namespace?.split(".").pop() || item.namespace || "")
          : selectedPath && item.namespace?.startsWith(selectedPath + ".")
            ? item.namespace.substring(selectedPath.length + 1)
            : (item.namespace || "");
        return (
          <Typography
            key={`header-${item.namespace}`}
            variant="h5"
            component="div"
            className="namespace-header"
          >
            {displayText}
          </Typography>
        );
      }

      if (item.type === "node" && item.node) {
        const node = item.node;
        return (
          <div key={node.node_type} className="node-wrapper">
            {isSearchResults ? (
              <SearchResultItem
                node={node}
                onDragStart={handleDragStart(node)}
                onDragEnd={handleDragEnd}
                onClick={() => handleCreateNode(node)}
              />
            ) : (
              <NodeItem
                key={node.node_type}
                node={node}
                onDragStart={handleDragStart(node)}
                onClick={() => handleCreateNode(node)}
                showFavoriteButton={showFavoriteButton}
              />
            )}
          </div>
        );
      }

      return null;
    },
    [
      flatItems,
      handleDragStart,
      handleDragEnd,
      handleCreateNode,
      isSearchResults,
      selectedPath,
      showFavoriteButton
    ]
  );

  const memoizedStyles = useMemo(() => virtualizedStyles(theme), [theme]);

  if (nodes.length === 0) {
    return (
      <Box css={virtualizedStyles(theme)}>
        <div className="no-results">
          <Typography variant="body1">No nodes found</Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
            Try adjusting your search or filters
          </Typography>
        </div>
      </Box>
    );
  }

  return (
    <Box css={memoizedStyles}>
      <div
        ref={containerRef}
        className="virtual-container"
        style={{ height: "100%" }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative"
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              className="virtual-item"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              {renderItem(virtualItem.index)}
            </div>
          ))}
        </div>
      </div>
    </Box>
  );
};

export default memo(VirtualizedNodeList, isEqual);
