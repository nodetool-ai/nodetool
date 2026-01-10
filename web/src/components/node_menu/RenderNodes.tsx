/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
// mui
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import VirtualizedNodeList from "./VirtualizedNodeList";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";
import ApiKeyValidation from "../node/ApiKeyValidation";

interface RenderNodesProps {
  nodes: NodeMetadata[];
}

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
  nodes
}) => {
  const { groupedSearchResults, searchTerm } =
    useNodeMenuStore((state) => ({
      groupedSearchResults: state.groupedSearchResults,
      searchTerm: state.searchTerm
    }));

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  const elements = useMemo(() => {
    // If we're searching, render flat ranked results with VirtualizedNodeList
    if (searchTerm && groupedSearchResults.length > 0) {
      const allSearchNodes = groupedSearchResults.flatMap(
        (group) => group.nodes
      );

      return (
        <VirtualizedNodeList
          key="search-results"
          nodes={allSearchNodes}
          isSearchMode={true}
        />
      );
    }

    // Otherwise use the original namespace-based grouping with VirtualizedNodeList
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

        elements.push(
          <Typography
            key={`namespace-${namespace}-${namespaceIndex}`}
            variant="h5"
            component="div"
            className="namespace-text"
          >
            {textForNamespaceHeader}
          </Typography>,
          <VirtualizedNodeList
            key={`virtualized-nodes-${namespace}`}
            nodes={nodesInNamespace}
            isSearchMode={false}
          />
        );
        return elements;
      }
    );
  }, [
    searchTerm,
    nodes,
    groupedSearchResults,
    selectedPath
  ]);

  return (
    <div className="nodes">
      {nodes.length > 0 ? (
        elements
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
