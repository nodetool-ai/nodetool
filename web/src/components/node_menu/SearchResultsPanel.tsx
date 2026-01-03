/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
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
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

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

  const renderSearchRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const node = searchNodes[index];
      return (
        <div style={style}>
          <SearchResultItem
            node={node}
            onDragStart={handleDragStart(node)}
            onDragEnd={handleDragEnd}
            onClick={() => handleCreateNode(node)}
          />
        </div>
      );
    },
    [searchNodes, handleDragStart, handleDragEnd, handleCreateNode]
  );

  return (
    <AutoSizer>
      {({ height, width }) => {
        const safeHeight = Math.max(height || 0, 100);
        const safeWidth = Math.max(width || 0, 280);
        return (
          <VirtualList
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
