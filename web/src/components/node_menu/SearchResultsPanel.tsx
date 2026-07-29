/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import SearchResultItem from "./SearchResultItem";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { EmptyState } from "../ui_primitives";

interface SearchResultsPanelProps {
  searchNodes: NodeMetadata[];
  /**
   * Compact mode: tighter rows, title-only — used by the left-panel sidebar
   * where the full row layout doesn't fit. Default false (floating menu).
   */
  compact?: boolean;
}

const ROW_HEIGHT = 72;
const ROW_HEIGHT_COMPACT = 36;

const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
  searchNodes,
  compact = false
}) => {
  const theme = useTheme();
  // Route click-to-add via PendingNodeCreateStore (safe outside the editor's
  // ReactFlowProvider, e.g. inside the left-panel Search view).
  const requestCreate = usePendingNodeCreateStore((s) => s.requestCreate);
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const selectedIndex = useNodeMenuStore((state) => state.selectedIndex);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: searchNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT),
    overscan: theme.virtualScroll.overscan.small,
  });

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
      requestCreate(node);
    },
    [requestCreate]
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
          // Compact rows use dynamic measurement so the actual 36 px row
          // height isn't approximated to the default 72 px estimate. Default
          // (floating-menu) rows keep their fixed `vi.size` height to
          // preserve hover-expand and scrollIntoView behavior unchanged.
          const itemProps = compact
            ? {
                "data-index": vi.index,
                ref: virtualizer.measureElement,
                style: {
                  position: "absolute" as const,
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                  overflow: "visible" as const,
                },
              }
            : {
                style: {
                  position: "absolute" as const,
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                  overflow: "visible" as const,
                },
              };
          return (
            <div key={vi.key} {...itemProps}>
              <SearchResultItem
                node={node}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleNodeClick}
                isKeyboardSelected={vi.index === selectedIndex}
                compact={compact}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(SearchResultsPanel);
