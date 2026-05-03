/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import SearchResultItem from "./SearchResultItem";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { EmptyState } from "../ui_primitives/EmptyState";

interface SearchResultsPanelProps {
  searchNodes: NodeMetadata[];
}

const ROW_HEIGHT = 72;

const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
  searchNodes
}) => {
  const handleCreateNode = useCreateNode();
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const selectedIndex = useNodeMenuStore((state) => state.selectedIndex);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: searchNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // Scroll to the selected item when selectedIndex changes
  useEffect(() => {
    if (selectedIndex >= 0 && searchNodes.length > 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, searchNodes.length, virtualizer]);

  const handleDragStart = useCallback(
    (node: NodeMetadata, event: React.DragEvent<HTMLDivElement>) => {
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

  const handleNodeClick = useCallback(
    (node: NodeMetadata) => {
      handleCreateNode(node);
    },
    [handleCreateNode]
  );

  if (searchNodes.length === 0) {
    return (
      <EmptyState
        variant="no-results"
        title="No matching nodes"
        description="Try a different search term or adjust your filters."
        size="small"
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        height: "100%",
        width: "100%",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const node = searchNodes[vi.index];
          return (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vi.size,
                transform: `translateY(${vi.start}px)`,
                overflow: "visible",
              }}
            >
              <SearchResultItem
                node={node}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleNodeClick}
                isKeyboardSelected={vi.index === selectedIndex}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(SearchResultsPanel);
