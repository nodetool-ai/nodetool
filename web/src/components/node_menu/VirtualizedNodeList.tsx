/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Box } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

const NODE_ITEM_HEIGHT = 36;

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  isSearchResults?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
  onHeightChange?: (height: number) => void;
}

export interface VirtualizedNodeListRef {
  scrollToItem: (index: number) => void;
  scrollToTop: () => void;
  focus: () => void;
}

const listStyles = {
  "& .react-window__scrollbar": {
    width: "6px"
  },
  "& .react-window__scrollbar-track": {
    background: "transparent"
  },
  "& .react-window__scrollbar-thumb": {
    backgroundColor: "action.disabledBackground",
    borderRadius: "8px"
  },
  "& .react-window__scrollbar-thumb:hover": {
    backgroundColor: "action.disabled"
  }
};

const VirtualizedNodeList = memo(
  forwardRef<VirtualizedNodeListRef, VirtualizedNodeListProps>(
    (
      {
        nodes,
        isSearchResults = false,
        selectedNodeTypes = [],
        onToggleSelection,
        showFavoriteButton = true,
        onHeightChange
      },
      ref
    ) => {
      const listRef = useRef<List>(null);
      const containerRef = useRef<HTMLDivElement>(null);

      const { groupedSearchResults, selectedIndex, setSelectedIndex } =
        useNodeMenuStore((state) => ({
          groupedSearchResults: state.groupedSearchResults,
          selectedIndex: state.selectedIndex,
          setSelectedIndex: state.setSelectedIndex
        }));

      const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
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

      useImperativeHandle(
        ref,
        () => ({
          scrollToItem: (index: number) => {
            listRef.current?.scrollToItem(index, "auto");
          },
          scrollToTop: () => {
            listRef.current?.scrollTo(0);
          },
          focus: () => {
            containerRef.current?.focus();
          }
        }),
        []
      );

      const flatNodes = useMemo(() => {
        if (isSearchResults && groupedSearchResults.length > 0) {
          return groupedSearchResults.flatMap((group) => group.nodes);
        }
        return nodes;
      }, [isSearchResults, groupedSearchResults, nodes]);

      const listHeight = useMemo(() => {
        const itemCount = flatNodes.length;
        if (itemCount === 0) {
          return 0;
        }
        return itemCount * NODE_ITEM_HEIGHT;
      }, [flatNodes.length]);

      useEffect(() => {
        onHeightChange?.(listHeight);
      }, [listHeight, onHeightChange]);

      const renderItem = useCallback(
        ({ index, style }: ListChildComponentProps) => {
          const node = flatNodes[index];
          const isSelected = selectedIndex === index;

          if (isSearchResults) {
            return (
              <Box sx={style}>
                <SearchResultItem
                  node={node}
                  onDragStart={handleDragStart(node)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleCreateNode(node)}
                  isKeyboardSelected={isSelected}
                />
              </Box>
            );
          }

          return (
            <Box sx={style}>
              <NodeItem
                node={node}
                onDragStart={handleDragStart(node)}
                onDragEnd={handleDragEnd}
                onClick={() => handleCreateNode(node)}
                showCheckbox={false}
                isSelected={selectedNodeTypes.includes(node.node_type)}
                onToggleSelection={onToggleSelection}
                showFavoriteButton={showFavoriteButton}
              />
            </Box>
          );
        },
        [
          flatNodes,
          isSearchResults,
          handleDragStart,
          handleDragEnd,
          handleCreateNode,
          selectedIndex,
          selectedNodeTypes,
          onToggleSelection,
          showFavoriteButton
        ]
      );

      const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
          const itemCount = flatNodes.length;
          if (itemCount === 0) {
            return;
          }

          let newIndex = selectedIndex;

          switch (e.key) {
            case "ArrowDown":
              e.preventDefault();
              newIndex = selectedIndex >= itemCount - 1 ? 0 : selectedIndex + 1;
              break;
            case "ArrowUp":
              e.preventDefault();
              newIndex = selectedIndex <= 0 ? itemCount - 1 : selectedIndex - 1;
              break;
            case "Home":
              e.preventDefault();
              newIndex = 0;
              break;
            case "End":
              e.preventDefault();
              newIndex = itemCount - 1;
              break;
            default:
              return;
          }

          setSelectedIndex(newIndex);
          listRef.current?.scrollToItem(newIndex, "auto");
        },
        [flatNodes.length, selectedIndex, setSelectedIndex]
      );

      const handleScroll = useCallback(
        ({ scrollOffset: _scrollOffset, scrollUpdateWasRequested }: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => {
          if (!scrollUpdateWasRequested) {
            // Scroll was initiated by user interaction - could be used for tracking
          }
        },
        []
      );

      if (flatNodes.length === 0) {
        return null;
      }

      return (
        <Box
          ref={containerRef}
          sx={{
            height: "100%",
            width: "100%",
            ...listStyles
          }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="listbox"
          aria-label="Node list"
        >
          <AutoSizer>
            {({ height, width }) => {
              if (height === 0 || width === 0) {
                return null;
              }
              return (
                <List
                  ref={listRef}
                  height={Math.min(height, listHeight)}
                  itemCount={flatNodes.length}
                  itemSize={NODE_ITEM_HEIGHT}
                  width={width}
                  style={{ height: listHeight, overflow: "hidden" }}
                  onScroll={handleScroll}
                  overscanCount={5}
                >
                  {renderItem}
                </List>
              );
            }}
          </AutoSizer>
        </Box>
      );
    }
  )
);

VirtualizedNodeList.displayName = "VirtualizedNodeList";

export default VirtualizedNodeList;
export { NODE_ITEM_HEIGHT };
