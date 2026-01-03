/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
// mui
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import NodeItem from "./NodeItem";
import {
  Typography,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from "@mui/material";
import isEqual from "lodash/isEqual";
import ApiKeyValidation from "../node/ApiKeyValidation";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { SearchResultGroup } from "../../utils/nodeSearch";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
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

const GroupTitle: React.FC<{ title: string }> = memo(function GroupTitle({
  title
}) {
  const tooltips: Record<string, string> = {
    Name: "Exact matches in node names",
    Namespace: "Matches in node namespaces and tags",
    Description: "Matches found in node descriptions. Better results on top."
  };

  return (
    <Tooltip title={tooltips[title] || ""} placement="bottom" enterDelay={200}>
      <Typography
        variant="h6"
        component="div"
        sx={{
          color: "#FFD700",
          fontSize: "1.1em",
          fontWeight: 600,
          padding: "1em 0 0.5em 0",
          letterSpacing: "0.5px"
        }}
      >
        {title}
      </Typography>
    </Tooltip>
  );
});

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection
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

  const renderGroup = useCallback(
    (group: SearchResultGroup) => {
      const groupedNodes = groupNodes(group.nodes);

      return (
        <Accordion
          key={group.title}
          defaultExpanded={true}
          disableGutters
          elevation={0}
          sx={{
            backgroundColor: "transparent",
            "&:before": { display: "none" },
            "& .MuiAccordionSummary-root": {
              minHeight: "unset",
              padding: "0.5em 0"
            },
            "& .MuiAccordionDetails-root": {
              padding: "0"
            }
          }}
        >
          <AccordionSummary
            expandIcon={
              <ExpandMoreIcon sx={{ color: "var(--palette-grey-500)" }} />
            }
          >
            <GroupTitle title={group.title} />
          </AccordionSummary>
          <AccordionDetails sx={{ padding: "0 0 1em 0" }}>
            {Object.entries(groupedNodes).map(
              ([namespace, nodesInNamespace]) => (
                <div key={namespace}>
                  <Typography
                    variant="h5"
                    component="div"
                    className="namespace-text"
                  >
                    {selectedPath.length > 0
                      ? namespace.replaceAll(selectedPath + ".", "")
                      : namespace}
                  </Typography>
                  {nodesInNamespace.map((node) => (
                    <div key={node.node_type}>
                      <NodeItem
                        key={node.node_type}
                        node={node}
                        onDragStart={handleDragStart(node)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleCreateNode(node)}
                        showCheckbox={showCheckboxes}
                        isSelected={selectedNodeTypes.includes(node.node_type)}
                        onToggleSelection={onToggleSelection}
                      />
                    </div>
                  ))}
                </div>
              )
            )}
          </AccordionDetails>
        </Accordion>
      );
    },
    [
      selectedPath,
      handleDragStart,
      handleDragEnd,
      showCheckboxes,
      selectedNodeTypes,
      onToggleSelection,
      handleCreateNode
    ]
  );

  const elements = useMemo(() => {
    // If we're searching, use the grouped results
    if (searchTerm) {
      return groupedSearchResults.map(renderGroup);
    }

    // Otherwise use the original namespace-based grouping
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
                onClick={() => handleCreateNode(node)}
                showCheckbox={showCheckboxes}
                isSelected={selectedNodeTypes.includes(node.node_type)}
                onToggleSelection={onToggleSelection}
              />
            </div>
          ))
        );
        return elements;
      }
    );
  }, [
    searchTerm,
    nodes,
    groupedSearchResults,
    renderGroup,
    selectedPath,
    handleDragStart,
    handleCreateNode,
    // added to fix linting error:
    showCheckboxes,
    onToggleSelection,
    selectedNodeTypes
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
