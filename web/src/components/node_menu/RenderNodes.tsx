/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import SearchResultItem from "./SearchResultItem";
import isEqual from "lodash/isEqual";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { NODE_ITEM_HEIGHT, NODE_ITEM_OVERSCAN } from "../../hooks/useVirtualizedNodes";
import VirtualNamespaceList from "./VirtualNamespaceList";
import { useVirtualizer } from "@tanstack/react-virtual";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

const VirtualSearchResults: React.FC<{
  nodes: NodeMetadata[];
  containerRef: React.RefObject<HTMLDivElement>;
  handleDragStart: (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => void;
  handleCreateNode: (node: NodeMetadata) => void;
}> = ({ nodes, containerRef, handleDragStart, handleCreateNode }) => {
  const count = nodes.length;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: () => NODE_ITEM_HEIGHT,
    overscan: NODE_ITEM_OVERSCAN,
    enabled: count > 20
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <Box
      ref={containerRef}
      sx={{
        height: "100%",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          height: `${totalSize}px`,
          width: "100%",
          position: "relative"
        }}
      >
        {items.map((virtualItem) => {
          const node = nodes[virtualItem.index];
          return (
            <Box
              key={virtualItem.key}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              <SearchResultItem
                node={node}
                onDragStart={handleDragStart(node)}
                onDragEnd={() => {}}
                onClick={() => handleCreateNode(node)}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  showFavoriteButton = true
}) => {
  const { groupedSearchResults, searchTerm } =
    useNodeMenuStore((state) => ({
      groupedSearchResults: state.groupedSearchResults,
      searchTerm: state.searchTerm
    }));

  const handleCreateNode = useCreateNode();
  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      serializeDragData(
        { type: "create-node", payload: node },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  const searchNodes = useMemo(() => {
    if (searchTerm && groupedSearchResults.length > 0) {
      return groupedSearchResults.flatMap((group) => group.nodes);
    }
    return null;
  }, [searchTerm, groupedSearchResults]);

  const containerRef = useRef<HTMLDivElement>(null);

  const style = searchNodes ? { height: "100%", overflow: "hidden" } : {};

  return (
    <div className="nodes" style={style}>
      {nodes.length > 0 ? (
        searchNodes ? (
          <VirtualSearchResults
            nodes={searchNodes}
            containerRef={containerRef}
            handleDragStart={handleDragStart}
            handleCreateNode={handleCreateNode}
          />
        ) : (
          <VirtualNamespaceList
            nodes={nodes}
            containerRef={containerRef}
            selectedPath={selectedPath}
            showCheckboxes={showCheckboxes}
            selectedNodeTypes={selectedNodeTypes}
            onToggleSelection={onToggleSelection}
            showFavoriteButton={showFavoriteButton}
          />
        )
      ) : (
        <div className="no-selection">
          <div className="explanation">
            <Typography variant="h5" style={{ marginTop: 0 }}>
              Browse Nodes
            </Typography>
            <ul>
              <li>Click on the namespaces to the left</li>
            </ul>

            <Typography variant="h5">Search Nodes</Typography>
            <ul>
              <li>Type in the search bar to search for nodes.</li>
            </ul>

            <Typography variant="h5">Create Nodes</Typography>
            <ul>
              <li>Click on a node</li>
              <li>Drag a node onto the canvas</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(RenderNodes, isEqual);
