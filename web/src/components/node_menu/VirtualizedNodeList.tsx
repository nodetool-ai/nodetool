/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef } from "react";
import { FixedSizeList as VirtualList, ListChildComponentProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import NodeItem from "./NodeItem";
import ApiKeyValidation from "../node/ApiKeyValidation";
import isEqual from "lodash/isEqual";
import { useCreateNode } from "../../hooks/useCreateNode";

interface VirtualizedNodeListProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

interface ListItem {
  type: "namespace-header" | "node" | "api-key";
  namespace?: string;
  node?: NodeMetadata;
  namespaceIndex?: number;
  isFirstForService?: boolean;
}

const ITEM_HEIGHT = 40;

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

const VirtualizedNodeList: React.FC<VirtualizedNodeListProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  showFavoriteButton = true
}) => {
  const { setDragToCreate, selectedPath } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    selectedPath: state.selectedPath.join(".")
  }));
  const { setHoveredNode } = useNodeMenuStore((state) => ({
    setHoveredNode: state.setHoveredNode
  }));
  const handleCreateNode = useCreateNode();
  const listRef = useRef<VirtualList>(null);

  const items = useMemo(() => {
    const result: ListItem[] = [];
    const groups = groupNodes(nodes);
    const seenServices = new Set<string>();
    const sortedNamespaces = Object.keys(groups).sort();

    sortedNamespaces.forEach((namespace, namespaceIndex) => {
      const nodesInNamespace = groups[namespace];
      const service = getServiceFromNamespace(namespace);
      const isFirstForService = !seenServices.has(service);
      seenServices.add(service);

      if (isFirstForService) {
        result.push({
          type: "api-key",
          namespace,
          namespaceIndex,
          isFirstForService: true
        });
      }

      let textForNamespaceHeader = namespace;
      if (selectedPath && selectedPath === namespace) {
        textForNamespaceHeader = namespace.split(".").pop() || namespace;
      } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
        textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
      }

      result.push({
        type: "namespace-header",
        namespace: textForNamespaceHeader,
        namespaceIndex
      });

      nodesInNamespace.forEach((node) => {
        result.push({
          type: "node",
          node,
          namespace
        });
      });
    });

    return result;
  }, [nodes, selectedPath]);

  const handleDragStart = useCallback(
    (_node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      setDragToCreate(true);
      event.dataTransfer.effectAllowed = "move";
    },
    [setDragToCreate]
  );

  const handleMouseEnter = useCallback(
    (node: NodeMetadata) => {
      return () => {
        setHoveredNode(node);
      };
    },
    [setHoveredNode]
  );

  const handleClick = useCallback(
    (node: NodeMetadata) => () => {
      handleCreateNode(node);
    },
    [handleCreateNode]
  );

  const containerStyles = useMemo(
    () => ({
      height: "100%",
      width: "100%",
      overflowX: "hidden" as const,
      overflowY: "auto" as const
    }),
    []
  );

  const renderItem = useCallback(
    ({ index, style, data }: ListChildComponentProps & { data: ListItem[] }) => {
      const item = data[index];
      if (!item) {return null;}

      switch (item.type) {
        case "api-key":
          return (
            <div style={style}>
              <ApiKeyValidation nodeNamespace={item.namespace ?? ""} />
            </div>
          );

        case "namespace-header":
          return (
            <div style={style}>
              <Typography
                variant="h5"
                component="div"
                className="namespace-text"
                sx={{ padding: "0.4em 0.5em 0.2em" }}
              >
                {item.namespace}
              </Typography>
            </div>
          );

        case "node":
          if (!item.node) {return null;}
          return (
            <div
              style={style}
              onMouseEnter={handleMouseEnter(item.node)}
            >
              <NodeItem
                node={item.node}
                onDragStart={handleDragStart(item.node)}
                onClick={handleClick(item.node)}
                showCheckbox={showCheckboxes}
                isSelected={selectedNodeTypes.includes(item.node.node_type)}
                onToggleSelection={onToggleSelection}
                showFavoriteButton={showFavoriteButton}
              />
            </div>
          );

        default:
          return null;
      }
    },
    [handleDragStart, handleMouseEnter, handleClick, showCheckboxes, selectedNodeTypes, onToggleSelection, showFavoriteButton]
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
    <AutoSizer>
      {({ height, width }) => {
        const safeHeight = Math.max(height || 0, 100);
        const safeWidth = Math.max(width || 0, 200);

        return (
          <VirtualList
            ref={listRef}
            height={safeHeight}
            width={safeWidth}
            itemCount={items.length}
            itemSize={ITEM_HEIGHT}
            itemKey={(index) => {
              const item = items[index];
              if (!item) {return `item-${index}`;}

              switch (item.type) {
                case "namespace-header":
                  return `header-${item.namespace}-${item.namespaceIndex}`;
                case "api-key":
                  return `apikey-${item.namespace}-${item.namespaceIndex}`;
                case "node":
                  return `node-${item.node?.node_type}`;
                default:
                  return `item-${index}`;
              }
            }}
            itemData={items}
            style={containerStyles}
            outerElementType="div"
          >
            {renderItem}
          </VirtualList>
        );
      }}
    </AutoSizer>
  );
};

export default memo(VirtualizedNodeList, isEqual);
