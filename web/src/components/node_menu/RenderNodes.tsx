/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
// mui
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import NodeItem from "./NodeItem";
import SearchResultsPanel from "./SearchResultsPanel";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  ListChildComponentProps,
  VariableSizeList as VirtualList
} from "react-window";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
}

// Stable utility functions - defined outside component to avoid recreation
const groupNodes = (nodes: NodeMetadata[]) => {
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

const NODE_ROW_HEIGHT = 44;
const NAMESPACE_ROW_HEIGHT = 34;
const API_VALIDATION_ROW_HEIGHT = 36;

type FlatRow =
  | {
      type: "api-validation";
      key: string;
      namespace: string;
    }
  | {
      type: "namespace";
      key: string;
      namespace: string;
      textForNamespaceHeader: string;
    }
  | {
      type: "node";
      key: string;
      node: NodeMetadata;
    };

interface RowData {
  rows: FlatRow[];
  handleDragStart: (
    node: NodeMetadata,
    event: React.DragEvent<HTMLDivElement>
  ) => void;
  handleNodeClick: (node: NodeMetadata) => void;
  showCheckboxes: boolean;
  selectedNodeTypesSet: Set<string>;
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton: boolean;
}

const renderVirtualRow = ({
  index,
  style,
  data
}: ListChildComponentProps<RowData>) => {
  const row = data.rows[index];
  if (!row) {
    return null;
  }

  if (row.type === "api-validation") {
    return (
      <div style={style}>
        <ApiKeyValidation nodeNamespace={row.namespace} />
      </div>
    );
  }

  if (row.type === "namespace") {
    return (
      <Typography
        style={style}
        key={row.key}
        variant="h5"
        component="div"
        className="namespace-text"
      >
        {row.textForNamespaceHeader}
      </Typography>
    );
  }

  return (
    <div style={style}>
      <NodeItem
        key={row.key}
        node={row.node}
        onDragStart={data.handleDragStart}
        onClick={data.handleNodeClick}
        showCheckbox={data.showCheckboxes}
        isSelected={data.selectedNodeTypesSet.has(row.node.node_type)}
        onToggleSelection={data.onToggleSelection}
        showFavoriteButton={data.showFavoriteButton}
      />
    </div>
  );
};

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  showFavoriteButton = true
}) => {
  const { setDragToCreate, groupedSearchResults, searchTerm } =
    useNodeMenuStore((state) => ({
      setDragToCreate: state.setDragToCreate,
      groupedSearchResults: state.groupedSearchResults,
      searchTerm: state.searchTerm
    }));
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);

  const handleCreateNode = useCreateNode();
  const handleDragStart = useCallback(
    (node: NodeMetadata, event: React.DragEvent<HTMLDivElement>) => {
      setDragToCreate(true);
      // Use unified drag serialization
      serializeDragData(
        { type: "create-node", payload: node },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "move";

      // Update global drag state
      setActiveDrag({ type: "create-node", payload: node });
    },
    [setDragToCreate, setActiveDrag]
  );

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  // Memoize grouped nodes to prevent recalculation on every render
  const groupedNodes = useMemo(() => {
    return groupNodes(nodes);
  }, [nodes]);

  const searchNodes = useMemo(() => {
    if (searchTerm && groupedSearchResults.length > 0) {
      return groupedSearchResults.flatMap((group) => group.nodes);
    }
    return null;
  }, [searchTerm, groupedSearchResults]);

  const handleNodeClick = useCallback(
    (node: NodeMetadata) => {
      handleCreateNode(node);
    },
    [handleCreateNode]
  );

  const selectedNodeTypesSet = useMemo(() => {
    return new Set(selectedNodeTypes);
  }, [selectedNodeTypes]);

  const virtualRows = useMemo(() => {
    const seenServices = new Set<string>();
    const rows: FlatRow[] = [];

    Object.entries(groupedNodes).forEach(
      ([namespace, nodesInNamespace], namespaceIndex) => {
        const service = getServiceFromNamespace(namespace);
        const isFirstNamespaceForService = !seenServices.has(service);
        seenServices.add(service);

        if (isFirstNamespaceForService) {
          rows.push({
            type: "api-validation",
            key: `api-key-${service}-${namespaceIndex}`,
            namespace
          });
        }

        let textForNamespaceHeader = namespace; // Default to full namespace string

        if (selectedPath && selectedPath === namespace) {
          // If the current group of nodes IS the selected namespace, display its last part.
          // e.g., selectedPath="A.B", namespace="A.B" -> display "B"
          textForNamespaceHeader = namespace.split(".").pop() || namespace;
        } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
          // If the current group of nodes is a sub-namespace of the selected one, display the relative path.
          // e.g., selectedPath="A", namespace="A.B.C" -> display "B.C"
          textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
        }
        // If selectedPath is empty (root is selected), textForNamespaceHeader remains the full 'namespace'.
        // If namespace is not a child of selectedPath and not equal to selectedPath,
        // it also remains the full 'namespace'.

        rows.push({
          type: "namespace",
          key: `namespace-${namespace}-${namespaceIndex}`,
          namespace,
          textForNamespaceHeader
        });

        nodesInNamespace.forEach((node) => {
          rows.push({
            type: "node",
            key: node.node_type,
            node
          });
        });
      }
    );

    return rows;
  }, [groupedNodes, selectedPath]);

  const rowData = useMemo<RowData>(() => {
    return {
      rows: virtualRows,
      handleDragStart,
      handleNodeClick,
      showCheckboxes,
      selectedNodeTypesSet,
      onToggleSelection,
      showFavoriteButton
    };
  }, [
    virtualRows,
    handleDragStart,
    handleNodeClick,
    showCheckboxes,
    selectedNodeTypesSet,
    onToggleSelection,
    showFavoriteButton
  ]);

  const getItemSize = useCallback(
    (index: number): number => {
      const row = virtualRows[index];
      if (!row) {
        return NODE_ROW_HEIGHT;
      }
      if (row.type === "namespace") {
        return NAMESPACE_ROW_HEIGHT;
      }
      if (row.type === "api-validation") {
        return API_VALIDATION_ROW_HEIGHT;
      }
      return NODE_ROW_HEIGHT;
    },
    [virtualRows]
  );

  const style = { height: "100%", overflow: "hidden" };

  return (
    <div className="nodes" style={style}>
      {nodes.length > 0 ? (
        searchNodes ? (
          <SearchResultsPanel searchNodes={searchNodes} />
        ) : (
          <AutoSizer>
            {({ height, width }) => {
              const safeHeight = Math.max(height || 0, 100);
              const safeWidth = Math.max(width || 0, 280);
              return (
                <VirtualList
                  height={safeHeight}
                  width={safeWidth}
                  itemCount={virtualRows.length}
                  itemData={rowData}
                  itemSize={getItemSize}
                  overscanCount={40}
                >
                  {renderVirtualRow}
                </VirtualList>
              );
            }}
          </AutoSizer>
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
