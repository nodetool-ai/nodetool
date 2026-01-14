/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
// mui
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import NodeItem from "./NodeItem";
import SearchResultItem from "./SearchResultItem";
import SearchResultsPanel from "./SearchResultsPanel";
import VirtualizedNodeList from "./VirtualizedNodeList";
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

const VIRTUALIZATION_THRESHOLD = 20;
const ITEM_HEIGHT = 40;

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

  const searchNodes = useMemo(() => {
    if (searchTerm && groupedSearchResults.length > 0) {
      return groupedSearchResults.flatMap((group) => group.nodes);
    }
    return null;
  }, [searchTerm, groupedSearchResults]);

  const elements = useMemo(() => {
    if (searchTerm && groupedSearchResults.length > 0) {
      const allSearchNodes = groupedSearchResults.flatMap(
        (group) => group.nodes
      );

      if (allSearchNodes.length >= VIRTUALIZATION_THRESHOLD) {
        return (
          <SearchResultsPanel
            searchNodes={
              <VirtualizedNodeList
                nodes={allSearchNodes}
                height="100%"
              />
            }
          />
        );
      }

      return allSearchNodes.map((node) => (
        <SearchResultItem
          key={node.node_type}
          node={node}
          onDragStart={handleDragStart(node)}
          onDragEnd={handleDragEnd}
          onClick={() => handleCreateNode(node)}
        />
      ));
    }

    const seenServices = new Set<string>();

    return Object.entries(groupNodes(nodes)).flatMap(
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

        let textForNamespaceHeader = namespace;

        if (selectedPath && selectedPath === namespace) {
          textForNamespaceHeader = namespace.split(".").pop() || namespace;
        } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
          textForNamespaceHeader = namespace.substring(selectedPath.length + 1);
        }

        const shouldVirtualize = nodesInNamespace.length >= VIRTUALIZATION_THRESHOLD;

        elements.push(
          <React.Fragment key={`namespace-fragment-${namespace}`}>
            <Typography
              key={`namespace-${namespace}-${namespaceIndex}`}
              variant="h5"
              component="div"
              className="namespace-text"
            >
              {textForNamespaceHeader}
            </Typography>
            {shouldVirtualize ? (
              <VirtualizedNodeList
                key={`virtualized-${namespace}`}
                nodes={nodesInNamespace}
                height={nodesInNamespace.length * ITEM_HEIGHT}
              />
            ) : (
              nodesInNamespace.map((node) => (
                <div key={node.node_type}>
                  <NodeItem
                    key={node.node_type}
                    node={node}
                    onDragStart={handleDragStart(node)}
                    onClick={() => handleCreateNode(node)}
                    showCheckbox={showCheckboxes}
                    isSelected={selectedNodeTypes.includes(node.node_type)}
                    onToggleSelection={onToggleSelection}
                    showFavoriteButton={showFavoriteButton}
                  />
                </div>
              ))
            )}
          </React.Fragment>
        );
        return elements;
      }
    );
  }, [
    searchTerm,
    nodes,
    groupedSearchResults,
    selectedPath,
    handleDragStart,
    handleDragEnd,
    handleCreateNode,
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
