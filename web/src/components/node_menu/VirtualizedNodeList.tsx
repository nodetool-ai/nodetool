/** @jsxImportSource @emotion/react */
import { memo, useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Box } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import NodeItem from "./NodeItem";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import useNodeMenuStore from "../../stores/NodeMenuStore";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  height?: number | string;
}

const ITEM_HEIGHT = 40;

export const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = memo(
  ({ nodes, height = 400 }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
    const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
    const clearDrag = useDragDropStore((s) => s.clearDrag);

    const handleCreateNode = useCreateNode();

    const rowVirtualizer = useVirtualizer({
      count: nodes.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ITEM_HEIGHT,
      overscan: 10
    });

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

    const handleClick = useCallback(
      (node: NodeMetadata) => () => {
        handleCreateNode(node);
      },
      [handleCreateNode]
    );

    useEffect(() => {
      if (nodes.length > 0 && parentRef.current) {
        rowVirtualizer.measure();
      }
    }, [nodes.length, rowVirtualizer]);

    return (
      <Box
      ref={parentRef}
      data-testid="virtualized-node-list-container"
      sx={{
        height: typeof height === "number" ? height : height,
        overflowY: "auto",
        width: "100%"
      }}
    >
        <Box
          sx={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative"
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const node = nodes[virtualRow.index];
            return (
              <Box
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                <NodeItem
                  node={node}
                  onDragStart={handleDragStart(node)}
                  onDragEnd={handleDragEnd}
                  onClick={handleClick(node)}
                  showFavoriteButton={true}
                />
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }
);

VirtualizedNodeList.displayName = "VirtualizedNodeList";

export default VirtualizedNodeList;
