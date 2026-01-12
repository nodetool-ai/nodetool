/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useRef, useEffect } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeItem from "./NodeItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as VirtualList, ListChildComponentProps } from "react-window";
import { Typography } from "@mui/material";

interface VirtualizedNamespaceNodesProps {
  nodes: NodeMetadata[];
  height?: number;
  width?: number;
}

interface NamespaceGroup {
  namespace: string;
  nodes: NodeMetadata[];
  isFirstForService: boolean;
  textForHeader: string;
}

const getServiceFromNamespace = (namespace: string): string => {
  const parts = namespace.split(".");
  return parts[0];
};

const groupNodesByNamespace = (
  nodes: NodeMetadata[],
  selectedPath: string[]
): NamespaceGroup[] => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });

  const seenServices = new Set<string>();
  const result: NamespaceGroup[] = Object.entries(groups).map(
    ([namespace, nodesInNamespace]) => {
      const service = getServiceFromNamespace(namespace);
      const isFirstForService = !seenServices.has(service);
      seenServices.add(service);

      let textForHeader = namespace;
      const selectedPathString = selectedPath.join(".");
      if (selectedPathString && selectedPathString === namespace) {
        textForHeader = namespace.split(".").pop() || namespace;
      } else if (
        selectedPathString &&
        namespace.startsWith(selectedPathString + ".")
      ) {
        textForHeader = namespace.substring(selectedPathString.length + 1);
      }

      return {
        namespace,
        nodes: nodesInNamespace,
        isFirstForService,
        textForHeader
      };
    }
  );

  return result;
};

const VirtualizedNamespaceNodes: React.FC<VirtualizedNamespaceNodesProps> = ({
  nodes,
  height: providedHeight,
  width: providedWidth
}) => {
  const listRef = useRef<VirtualList>(null);

  const { setDragToCreate, selectedPath } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    selectedPath: state.selectedPath
  }));

  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();

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

  const namespaceGroups = useMemo(
    () => groupNodesByNamespace(nodes, selectedPath),
    [nodes, selectedPath]
  );

  const getItemSize = useCallback(
    (index: number): number => {
      const group = namespaceGroups[index];
      if (!group) {
        return 50;
      }
      return group.nodes.length * 36 + 40;
    },
    [namespaceGroups]
  );

  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [namespaceGroups]);

  const renderGroup = useCallback(
    ({ index, style: rowStyle, data }: ListChildComponentProps & { data: NamespaceGroup }) => {
      const group = data;
      return (
        <div style={rowStyle}>
          <div style={{ display: "flex", flexDirection: "column", padding: "0 0.5em" }}>
            {group.isFirstForService && (
              <ApiKeyValidation
                key={`api-key-${group.namespace}-${index}`}
                nodeNamespace={group.namespace}
              />
            )}
            <Typography
              key={`namespace-${group.namespace}-${index}`}
              variant="h5"
              component="div"
              style={{
                color: "var(--palette-text-secondary)",
                fontWeight: 600,
                fontSize: "0.85rem",
                padding: "0.8em 0 0.4em 0",
                margin: "1.5em 0 0.8em 0",
                letterSpacing: "0.8px",
                wordBreak: "break-word",
                userSelect: "none",
                pointerEvents: "none",
                textTransform: "uppercase"
              }}
            >
              {group.textForHeader}
            </Typography>
            {group.nodes.map((node: NodeMetadata) => (
              <div key={node.node_type} style={{ padding: "2px 0" }}>
                <NodeItem
                  node={node}
                  onDragStart={handleDragStart(node)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleCreateNode(node)}
                />
              </div>
            ))}
          </div>
        </div>
      );
    },
    [handleDragStart, handleDragEnd, handleCreateNode]
  );

  const itemData = useMemo(
    () => namespaceGroups,
    [namespaceGroups]
  );

  const itemKey = useCallback(
    (index: number) => {
      const group = namespaceGroups[index];
      return group ? `namespace-${group.namespace}` : `empty-${index}`;
    },
    [namespaceGroups]
  );

  const innerElementType = useCallback(
    ({ style, ...rest }: React.HTMLAttributes<HTMLDivElement>) => {
      return <div style={{ ...style, overflowX: "hidden" }} {...rest} />;
    },
    []
  );

  return (
    <AutoSizer>
      {({ height: autoHeight, width: autoWidth }) => {
        const safeHeight = providedHeight ?? Math.max(autoHeight || 0, 100);
        const safeWidth = providedWidth ?? Math.max(autoWidth || 0, 280);

        return (
          <VirtualList
            ref={listRef}
            height={safeHeight}
            width={safeWidth}
            itemCount={namespaceGroups.length}
            itemSize={getItemSize}
            itemKey={itemKey}
            itemData={itemData}
            innerElementType={innerElementType}
            style={{ overflowX: "hidden" }}
          >
            {renderGroup}
          </VirtualList>
        );
      }}
    </AutoSizer>
  );
};

export default memo(VirtualizedNamespaceNodes);
