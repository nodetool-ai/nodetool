/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NodeMetadata } from "../../stores/ApiTypes";
import SearchResultItem from "./SearchResultItem";
import isEqual from "lodash/isEqual";
import useNodeMenuStore from "../../stores/NodeMenuStore";

interface VirtualizedSearchResultsProps {
  nodes: NodeMetadata[];
  onNodeClick?: (node: NodeMetadata) => void;
  onDragStart?: (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  itemHeight?: number;
  overscan?: number;
}

const nodeItemHeight = 36;
const overscanDefault = 5;

const styles = () =>
  css({
    "&": {
      height: "100%",
      width: "100%",
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".virtual-list-container": {
      position: "relative",
      height: "100%",
      width: "100%"
    },
    ".virtual-list-item": {
      position: "absolute",
      width: "100%",
      left: 0
    },
    ".node-item-wrapper": {
      padding: "2px 0"
    }
  });

const VirtualizedSearchResults: React.FC<VirtualizedSearchResultsProps> = ({
  nodes,
  onNodeClick,
  onDragStart,
  onDragEnd,
  itemHeight = nodeItemHeight,
  overscan = overscanDefault
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  const memoizedStyles = useMemo(() => styles(), []);

  const selectedIndex = useNodeMenuStore((state) => state.selectedIndex);

  const rowVirtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => itemHeight,
    overscan
  });

  useEffect(() => {
    if (rowVirtualizer && nodes.length > 0) {
      rowVirtualizer.measure();
    }
  }, [nodes.length, rowVirtualizer]);

  useEffect(() => {
    if (selectedIndex >= 0 && rowVirtualizer && selectedIndex < nodes.length) {
      rowVirtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, nodes.length, rowVirtualizer]);

  const handleItemClick = useCallback(
    (node: NodeMetadata) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  const handleDragStartFactory = useCallback(
    (node: NodeMetadata): ((event: React.DragEvent<HTMLDivElement>) => void) | undefined => {
      return onDragStart ? onDragStart(node) : undefined;
    },
    [onDragStart]
  );

  const getDragStartHandler = useCallback((node: NodeMetadata) => {
    const handler = handleDragStartFactory(node);
    return handler ?? (() => {});
  }, [handleDragStartFactory]);

  if (nodes.length === 0) {
    return (
      <div css={memoizedStyles} className="virtual-list-container">
        <div style={{ padding: "1em", color: "#888" }}>
          No results found
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} css={memoizedStyles} className="virtual-list-container">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative"
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const node = nodes[virtualItem.index];
          if (!node) {
            return null;
          }

          return (
            <div
              key={`search-${node.node_type}`}
              className="virtual-list-item"
              style={{
                top: virtualItem.start,
                height: `${virtualItem.size}px`
              }}
            >
              <div className="node-item-wrapper">
                <SearchResultItem
                  node={node}
                  onDragStart={getDragStartHandler(node)}
                  onDragEnd={onDragEnd}
                  onClick={() => handleItemClick(node)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(VirtualizedSearchResults, isEqual);
