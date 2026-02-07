/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
// mui
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import SearchResultsPanel from "./SearchResultsPanel";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";
import ApiKeyValidation from "../node/ApiKeyValidation";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

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
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();
  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
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

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

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
    (node: NodeMetadata) => () => {
      handleCreateNode(node);
    },
    [handleCreateNode]
  );

  const elements = useMemo(() => {
    // If we're searching, render flat ranked results with SearchResultItem
    if (searchTerm && groupedSearchResults.length > 0) {
      // Flatten all results from groups (now just one "Results" group)
      const allSearchNodes = groupedSearchResults.flatMap(
        (group) => group.nodes
      );

      return allSearchNodes.map((node) => (
        <SearchResultItem
          key={node.node_type}
          node={node}
          onDragStart={handleDragStart(node)}
          onDragEnd={handleDragEnd}
          onClick={handleNodeClick(node)}
        />
      ));
    }

    // Otherwise use the original namespace-based grouping
    const seenServices = new Set<string>();

    return Object.entries(groupedNodes).flatMap(
      ([namespace, nodesInNamespace], namespaceIndex) => {
        const service = getServiceFromNamespace(namespace);
        const isFirstNamespaceForService = !seenServices.has(service);
        seenServices.add(service);

        const elements: JSX.Element[] = [];

        if (isFirstNamespaceForService) {
          elements.push(
            <ApiKeyValidation
              key={`api-key-${service}-${namespaceIndex}`}
              nodeNamespace={namespace}
            />
          );
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

        elements.push(
          <Typography
            key={`namespace-${namespace}-${namespaceIndex}`}
            variant="h5"
            component="div"
            className="namespace-text"
          >
            {textForNamespaceHeader}
          </Typography>,
            ...nodesInNamespace.map((node) => (
            <div key={node.node_type}>
              <NodeItem
                key={node.node_type}
                node={node}
                onDragStart={handleDragStart(node)}
                onClick={handleNodeClick(node)}
                showCheckbox={showCheckboxes}
                isSelected={selectedNodeTypes.includes(node.node_type)}
                onToggleSelection={onToggleSelection}
                showFavoriteButton={showFavoriteButton}
              />
            </div>
          ))
        );
        return elements;
      }
    );
  }, [
    searchTerm,
    groupedNodes,
    groupedSearchResults,
    selectedPath,
    handleDragStart,
    handleDragEnd,
    handleNodeClick,
    showCheckboxes,
    onToggleSelection,
    selectedNodeTypes,
    showFavoriteButton
  ]);

  const style = searchNodes ? { height: "100%", overflow: "hidden" } : {};

  return (
    <div className="nodes" style={style}>
      {nodes.length > 0 ? (
        searchNodes ? (
          <SearchResultsPanel searchNodes={searchNodes} />
        ) : (
          elements
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
