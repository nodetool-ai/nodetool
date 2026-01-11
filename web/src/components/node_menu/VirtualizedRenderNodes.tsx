/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef, useEffect } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as VirtualList, ListChildComponentProps } from "react-window";
import { Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeItem from "./NodeItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import isEqual from "lodash/isEqual";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

interface ListItem {
  type: "header" | "apikey" | "node";
  key: string;
  namespace: string;
  node?: NodeMetadata;
  namespaceIndex?: number;
}

const groupNodes = (nodes: NodeMetadata[]): { [key: string]: NodeMetadata[] } => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });
  return groups;
};

const getServiceFromNamespace = (namespace: string): string => {
  const parts = namespace.split(".");
  return parts[0];
};

const HEADER_HEIGHT = 40;
const APIKEY_HEIGHT = 32;
const NODE_HEIGHT = 48;

const VirtualizedRenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  showFavoriteButton = true
}) => {
  const listRef = useRef<VirtualList>(null);
  const handleCreateNode = useCreateNode();
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const selectedIndex = useNodeMenuStore((state) => state.selectedIndex);
  const selectedPath = useNodeMenuStore((state) => state.selectedPath);

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

  const { flattenedItems, itemHeights, nodeToIndexMap } = useMemo(() => {
    const grouped = groupNodes(nodes);
    const seenServices = new Set<string>();
    const items: ListItem[] = [];
    const heights: number[] = [];
    const nodeToIndex: Map<string, number> = new Map();

    Object.entries(grouped).forEach(([namespace, nodesInNamespace], namespaceIndex) => {
      const service = getServiceFromNamespace(namespace);
      const isFirstNamespaceForService = !seenServices.has(service);
      seenServices.add(service);

      if (isFirstNamespaceForService) {
        items.push({
          type: "apikey",
          key: `apikey-${service}-${namespaceIndex}`,
          namespace
        });
        heights.push(APIKEY_HEIGHT);
      }

      let _textForNamespaceHeader = namespace;
      if (selectedPath && selectedPath.length > 0) {
        const selectedPathString = selectedPath.join(".");
        if (selectedPathString === namespace) {
          _textForNamespaceHeader = namespace.split(".").pop() || namespace;
        } else if (namespace.startsWith(selectedPathString + ".")) {
          _textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
        }
      }

      items.push({
        type: "header",
        key: `header-${namespace}-${namespaceIndex}`,
        namespace,
        namespaceIndex
      });
      heights.push(HEADER_HEIGHT);

      nodesInNamespace.forEach((node) => {
        items.push({
          type: "node",
          key: node.node_type,
          namespace,
          node
        });
        heights.push(NODE_HEIGHT);
        nodeToIndex.set(node.node_type, items.length - 1);
      });
    });

    return { flattenedItems: items, itemHeights: heights, nodeToIndexMap: nodeToIndex };
  }, [nodes, selectedPath]);

  const getItemSize = useCallback((index: number): number => {
    return itemHeights[index] || NODE_HEIGHT;
  }, [itemHeights]);

  const _scrollToNode = useCallback((nodeType: string) => {
    const index = nodeToIndexMap.get(nodeType);
    if (index !== undefined && listRef.current) {
      listRef.current.scrollToItem(index, "smart");
    }
  }, [nodeToIndexMap]);

  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < flattenedItems.length && listRef.current) {
      listRef.current.scrollToItem(selectedIndex, "smart");
    }
  }, [selectedIndex, flattenedItems.length]);

  const renderItem = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const item = flattenedItems[index];
      if (!item) {
        return null;
      }

      if (item.type === "apikey") {
        return (
          <div style={style}>
            <ApiKeyValidation
              nodeNamespace={item.namespace}
            />
          </div>
        );
      }

      if (item.type === "header") {
        let textForNamespaceHeader = item.namespace;
        if (selectedPath && selectedPath.length > 0) {
          const selectedPathString = selectedPath.join(".");
          if (selectedPathString === item.namespace) {
            textForNamespaceHeader = item.namespace.split(".").pop() || item.namespace;
          } else if (item.namespace.startsWith(selectedPathString + ".")) {
            textForNamespaceHeader = item.namespace.substring(selectedPath.length + 1);
          }
        }

        return (
          <div style={style}>
            <Typography
              variant="h5"
              component="div"
              className="namespace-text"
              sx={{ px: 1 }}
            >
              {textForNamespaceHeader}
            </Typography>
          </div>
        );
      }

      if (!item.node) {
        return null;
      }

      const node = item.node;

      return (
        <div style={style}>
          <NodeItem
            node={node}
            onDragStart={handleDragStart(node)}
            onDragEnd={handleDragEnd}
            onClick={() => handleCreateNode(node)}
            showCheckbox={showCheckboxes}
            isSelected={selectedNodeTypes.includes(node.node_type)}
            onToggleSelection={onToggleSelection}
            showFavoriteButton={showFavoriteButton}
          />
        </div>
      );
    },
    [
      flattenedItems,
      handleDragStart,
      handleDragEnd,
      handleCreateNode,
      showCheckboxes,
      onToggleSelection,
      selectedNodeTypes,
      showFavoriteButton,
      selectedPath
    ]
  );

  if (nodes.length === 0) {
    return (
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
    );
  }

  return (
    <div className="nodes" style={{ height: "100%", width: "100%" }}>
      <AutoSizer>
        {({ height, width }) => {
          const safeHeight = Math.max(height || 0, 100);
          const safeWidth = Math.max(width || 0, 280);
          return (
            <VirtualList
              ref={listRef}
              height={safeHeight}
              width={safeWidth}
              itemCount={flattenedItems.length}
              itemSize={getItemSize}
              style={{ overflowX: "hidden" }}
            >
              {renderItem}
            </VirtualList>
          );
        }}
      </AutoSizer>
    </div>
  );
};

export default memo(VirtualizedRenderNodes, isEqual);
