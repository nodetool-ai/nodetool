/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import SearchResultItem from "./SearchResultItem";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as VirtualList, ListChildComponentProps } from "react-window";

interface SearchResultsPanelProps {
  searchNodes: NodeMetadata[];
}

const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
  searchNodes
}) => {
  const handleCreateNode = useCreateNode();
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const selectedIndex = useNodeMenuStore((state) => state.selectedIndex);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const listRef = useRef<VirtualList>(null);

  // Scroll to the selected item when selectedIndex changes
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedIndex, "smart");
    }
  }, [selectedIndex]);

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

  const renderSearchRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const node = searchNodes[index];
      return (
        <div style={{ ...style, overflow: "visible" }}>
          <SearchResultItem
            node={node}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={handleNodeClick}
            isKeyboardSelected={index === selectedIndex}
          />
        </div>
      );
    },
    [searchNodes, handleDragStart, handleDragEnd, handleNodeClick, selectedIndex]
  );

  return (
    <AutoSizer>
      {({ height, width }) => {
        const safeHeight = Math.max(height || 0, 100);
        const safeWidth = Math.max(width || 0, 280);
        return (
          <VirtualList
            ref={listRef}
            height={safeHeight}
            width={safeWidth}
            itemCount={searchNodes.length}
            itemSize={72}
            style={{ overflowX: "hidden" }}
          >
            {renderSearchRow}
          </VirtualList>
        );
      }}
    </AutoSizer>
  );
};

export default memo(SearchResultsPanel);
