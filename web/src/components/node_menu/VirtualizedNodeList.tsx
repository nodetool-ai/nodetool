/** @jsxImportSource @emotion/react */
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { Box } from "@mui/material";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  isSearchMode?: boolean;
}

const ITEM_HEIGHT = 52;

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  isSearchMode = false
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

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

  const row = useCallback(
    (index: number) => {
      const node = nodes[index];
      if (isSearchMode) {
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
        <div key={node.node_type}>
          <NodeItem
            node={node}
            onDragStart={handleDragStart(node)}
            onClick={() => handleCreateNode(node)}
            showFavoriteButton={true}
          />
        </div>
      );
    },
    [nodes, isSearchMode, handleDragStart, handleDragEnd, handleCreateNode]
  );

  const count = nodes.length;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5
  });

  const items = virtualizer.getVirtualItems();

  const totalHeight = useMemo(() => {
    return virtualizer.getTotalSize();
  }, [virtualizer]);

  if (count === 0) {
    return (
      <Box sx={{ p: 2, color: "text.secondary" }}>
        No nodes found
      </Box>
    );
  }

  return (
    <Box
      ref={parentRef}
      sx={{
        height: "100%",
        overflowY: "auto",
        width: "100%"
      }}
    >
      <Box
        sx={{
          height: `${totalHeight}px`,
          width: "100%",
          position: "relative"
        }}
      >
        {items.map((virtualRow) => (
          <Box
            key={virtualRow.key}
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            {row(virtualRow.index)}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default memo(VirtualizedNodeList);
