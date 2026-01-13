/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeItem from "./NodeItem";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as VirtualList, ListChildComponentProps } from "react-window";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  height?: number;
  width?: number;
  style?: React.CSSProperties;
}

const NODE_ITEM_HEIGHT = 48;

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  height: providedHeight,
  width: providedWidth,
  style: containerStyle
}) => {
  const handleCreateNode = useCreateNode();
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const selectedIndex = useNodeMenuStore((state) => state.selectedIndex);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const listRef = useRef<VirtualList>(null);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedIndex, "smart");
    }
  }, [selectedIndex]);

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

  const renderRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const node = nodes[index];
      if (!node) {
        return null;
      }

      const isKeyboardSelected = index === selectedIndex;

      return (
        <div style={style}>
          <NodeItem
            node={node}
            onDragStart={handleDragStart(node)}
            onDragEnd={handleDragEnd}
            onClick={() => handleCreateNode(node)}
            isSelected={isKeyboardSelected}
          />
        </div>
      );
    },
    [nodes, selectedIndex, handleDragStart, handleDragEnd, handleCreateNode]
  );

  if (providedHeight !== undefined && providedWidth !== undefined) {
    const safeHeight = Math.max(providedHeight || 0, 100);
    const safeWidth = Math.max(providedWidth || 0, 280);
    return (
      <VirtualList
        ref={listRef}
        height={safeHeight}
        width={safeWidth}
        itemCount={nodes.length}
        itemSize={NODE_ITEM_HEIGHT}
        itemKey={(index) => nodes[index]?.node_type || index}
        style={{ overflowX: "hidden", ...containerStyle }}
      >
        {renderRow}
      </VirtualList>
    );
  }

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
            itemCount={nodes.length}
            itemSize={NODE_ITEM_HEIGHT}
            itemKey={(index) => nodes[index]?.node_type || index}
            style={{ overflowX: "hidden", ...containerStyle }}
          >
            {renderRow}
          </VirtualList>
        );
      }}
    </AutoSizer>
  );
};

export default memo(VirtualizedNodeList);
