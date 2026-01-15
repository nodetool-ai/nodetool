/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef, useEffect } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeItem from "./NodeItem";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as VirtualList, ListChildComponentProps } from "react-window";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { Typography } from "@mui/material";

const NAMESPACE_HEADER_HEIGHT = 52;
const NODE_ITEM_HEIGHT = 44;
const API_KEY_VALIDATION_HEIGHT = 60;

interface GroupedNodes {
  [namespace: string]: NodeMetadata[];
}

interface VirtualizedNamespaceNodeListProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

interface ListItem {
  type: "header" | "api-key" | "node";
  namespace: string;
  namespaceIndex: number;
  node?: NodeMetadata;
  nodeIndex?: number;
}

const groupNodes = (nodes: NodeMetadata[]): GroupedNodes => {
  const groups: GroupedNodes = {};
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

const VirtualizedNamespaceNodeList: React.FC<VirtualizedNamespaceNodeListProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  showFavoriteButton = true
}) => {
  const handleCreateNode = useCreateNode();
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const listRef = useRef<VirtualList>(null);

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  const groupedNodes = useMemo(() => groupNodes(nodes), [nodes]);

  const listItems = useMemo(() => {
    const items: ListItem[] = [];
    const seenServices = new Set<string>();
    let namespaceIndex = 0;

    Object.entries(groupedNodes).forEach(([namespace, nodesInNamespace]) => {
      const service = getServiceFromNamespace(namespace);
      const isFirstNamespaceForService = !seenServices.has(service);

      if (isFirstNamespaceForService) {
        seenServices.add(service);
        items.push({
          type: "api-key",
          namespace,
          namespaceIndex: namespaceIndex++
        });
      }

      const textForNamespaceHeader = (() => {
        if (selectedPath && selectedPath === namespace) {
          return namespace.split(".").pop() || namespace;
        } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
          return namespace.substring(selectedPath.length + 1);
        }
        return namespace;
      })();

      items.push({
        type: "header",
        namespace: textForNamespaceHeader,
        namespaceIndex: namespaceIndex++
      });

      nodesInNamespace.forEach((node, nodeIndex) => {
        items.push({
          type: "node",
          namespace,
          namespaceIndex: namespaceIndex++,
          node,
          nodeIndex
        });
      });
    });

    return items;
  }, [groupedNodes, selectedPath]);

  const getItemSize = useCallback((index: number): number => {
    const item = listItems[index];
    if (item.type === "header") {
      return NAMESPACE_HEADER_HEIGHT;
    } else if (item.type === "api-key") {
      return API_KEY_VALIDATION_HEIGHT;
    }
    return NODE_ITEM_HEIGHT;
  }, [listItems]);

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

  const renderListItem = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const item = listItems[index];

      if (item.type === "api-key") {
        return (
          <div style={style}>
            <ApiKeyValidation
              nodeNamespace={item.namespace}
            />
          </div>
        );
      }

      if (item.type === "header") {
        return (
          <div style={style}>
            <Typography
              variant="h5"
              component="div"
              className="namespace-text"
            >
              {item.namespace}
            </Typography>
          </div>
        );
      }

      if (item.type === "node" && item.node) {
        return (
          <div style={{ ...style, height: NODE_ITEM_HEIGHT }}>
            <NodeItem
              node={item.node}
              onDragStart={handleDragStart(item.node)}
              onDragEnd={handleDragEnd}
              onClick={() => handleCreateNode(item.node!)}
              showCheckbox={showCheckboxes}
              isSelected={selectedNodeTypes.includes(item.node!.node_type)}
              onToggleSelection={onToggleSelection}
              showFavoriteButton={showFavoriteButton}
            />
          </div>
        );
      }

      return null;
    },
    [
      listItems,
      handleDragStart,
      handleDragEnd,
      handleCreateNode,
      showCheckboxes,
      selectedNodeTypes,
      onToggleSelection,
      showFavoriteButton
    ]
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [listItems]);

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
            itemCount={listItems.length}
            itemSize={getItemSize}
            style={{ overflowX: "hidden" }}
          >
            {renderListItem}
          </VirtualList>
        );
      }}
    </AutoSizer>
  );
};

export default memo(VirtualizedNamespaceNodeList);
