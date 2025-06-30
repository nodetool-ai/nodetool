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
import { isEqual } from "lodash";
import ThemeNodes from "../themes/ThemeNodes";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { SearchResultGroup } from "../../utils/nodeSearch";

interface RenderNodesSelectableProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  onNodeClick?: (node: NodeMetadata) => void;
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
          color: ThemeNodes.palette.primary.main,
          fontSize: "0.9em",
          padding: "0.5em 0 0"
        }}
      >
        {title}
      </Typography>
    </Tooltip>
  );
});

const RenderNodesSelectable: React.FC<RenderNodesSelectableProps> = ({
  nodes,
  showCheckboxes = false,
  selectedNodeTypes = [],
  onToggleSelection,
  onNodeClick
}) => {
  const { groupedSearchResults, searchTerm } = useNodeMenuStore((state) => ({
    groupedSearchResults: state.groupedSearchResults,
    searchTerm: state.searchTerm
  }));

  // No-op drag start for selection mode
  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      if (showCheckboxes) {
        event.preventDefault();
        return;
      }
      // Allow dragging if not in checkbox mode
      event.dataTransfer.setData("create-node", JSON.stringify(node));
      event.dataTransfer.effectAllowed = "move";
    },
    [showCheckboxes]
  );

  // Handle node click - either selection or custom handler
  const handleNodeClick = useCallback(
    (node: NodeMetadata) => {
      if (onNodeClick) {
        onNodeClick(node);
      } else if (showCheckboxes && onToggleSelection) {
        onToggleSelection(node.node_type);
      }
    },
    [onNodeClick, showCheckboxes, onToggleSelection]
  );

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  const renderGroup = useCallback(
    (group: SearchResultGroup) => {
      const groupedNodes = groupNodes(group.nodes);

      return (
        <Accordion key={group.title} defaultExpanded={true} disableGutters>
          <AccordionSummary
            expandIcon={
              <ExpandMoreIcon sx={{ color: ThemeNodes.palette.grey[500] }} />
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
                        onClick={() => handleNodeClick(node)}
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
      showCheckboxes,
      selectedNodeTypes,
      onToggleSelection,
      handleNodeClick
    ]
  );

  const elements = useMemo(() => {
    // If we're searching, use the grouped results
    if (searchTerm) {
      return groupedSearchResults.map(renderGroup);
    }

    // Otherwise use the original namespace-based grouping
    return Object.entries(groupNodes(nodes)).flatMap(
      ([namespace, nodesInNamespace], namespaceIndex) => {
        const elements = [];

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
                onClick={() => handleNodeClick(node)}
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
    handleNodeClick,
    showCheckboxes,
    selectedNodeTypes,
    onToggleSelection
  ]);

  return (
    <div className="nodes">
      {nodes.length > 0 ? (
        elements
      ) : (
        <div className="no-selection">
          <div className="explanation">
            <Typography variant="h5" style={{ marginTop: 0 }}>
              {showCheckboxes ? "Select Nodes" : "Browse Nodes"}
            </Typography>
            <ul>
              {showCheckboxes ? (
                <>
                  <li>Click checkboxes to select nodes as tools</li>
                  <li>Search for specific nodes using the search bar</li>
                </>
              ) : (
                <>
                  <li>Click on the namespaces to the left</li>
                  <li>Type in the search bar to search for nodes</li>
                  <li>Click on a node or drag it onto the canvas</li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(RenderNodesSelectable, isEqual);
