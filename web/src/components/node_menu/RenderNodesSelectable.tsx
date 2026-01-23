/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
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
  AccordionDetails,
  Checkbox,
  Box
} from "@mui/material";
import isEqual from "lodash/isEqual";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { SearchResultGroup } from "../../utils/nodeSearch";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

interface RenderNodesSelectableProps {
  nodes: NodeMetadata[];
  showCheckboxes?: boolean;
  selectedNodeTypes?: string[];
  onToggleSelection?: (nodeType: string) => void;
  onNodeClick?: (node: NodeMetadata) => void;
  onSetSelection?: (newSelection: string[]) => void;
  hideSelectedSection?: boolean;
}

const listStyles = () =>
  css({
    "& .MuiPaper-root.MuiAccordion-root": {
      backgroundColor: "transparent !important",
      boxShadow: "none !important",
      "--Paper-overlay": "0 !important",
      "&:before": {
        display: "none"
      },
      "& .MuiAccordionDetails-root": {
        backgroundColor: "transparent !important",
        padding: "0 0 1em 0"
      },
      "& .MuiPaper-elevation, .MuiPaper-elevation1": {
        backgroundColor: "transparent !important"
      },
      "& .Mui-expanded": {
        backgroundColor: "transparent !important"
      },
      "& .MuiAccordion-rounded": {
        backgroundColor: "transparent !important"
      }
    },
    ".MuiAccordionSummary-root": {
      padding: 0,
      minHeight: "unset",
      "& .MuiAccordionSummary-content": {
        margin: 0
      }
    },
    ".node .node-button": {
      border: `1px solid transparent`,
      transition:
        "outline-color 120ms ease, background-color 120ms ease, border-color 120ms ease"
    },
    ".node.selected .node-button": {
      backgroundColor: "grey.850",
      opacity: 0.7,
      "&:hover": {
        opacity: 0.9
      }
    },
    // Section header for "Selected" section
    ".section-header": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 4px 6px",
      marginBottom: "4px",
      borderBottom: `1px solid grey.700`,
      "& .section-title": {
        fontSize: "0.7em",
        fontWeight: 600,  
        color: "grey.400",
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      },
      "& .section-count": {
        fontSize: "0.7em",
        color: "grey.500"
      }
    },
    // Namespace styling - cleaner, more subtle
    ".namespace-text": {
      color: "grey.300",
      fontSize: "0.8em",
      fontWeight: 500,
      padding: 0,
      margin: 0,
      lineHeight: 1.5,
      display: "flex",
      alignItems: "center"
    },
    ".namespace-row": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      padding: "2px 0 2px 4px",
      margin: "6px 0 2px",
      borderBottom: `1px solid grey.800`,
      minHeight: "32px",
      "& .MuiTooltip-root": {
        display: "flex",
        alignItems: "center"
      }
    },
    ".namespace-row .namespace-text": {
      display: "flex",
      alignItems: "center",
      padding: 0,
      margin: 0,
      borderRadius: 0,
      backgroundColor: "transparent",
      border: "none"
    },
    ".checkbox-cell": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      flexShrink: 0,
      lineHeight: 0,
      height: "auto"
    },
    // Namespace checkbox styling - match node checkbox styling exactly
    ".namespace-checkbox": {
      padding: "2px",
      margin: 0,
      "& .MuiSvgIcon-root": {
        fontSize: "1.1rem"
      }
    },
    // Node items indentation when under namespace
    ".node-items-group": {
      paddingLeft: "4px"
    }
  });

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
  const theme = useTheme();
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
          color: theme.vars.palette.primary.main,
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
  onNodeClick,
  onSetSelection,
  hideSelectedSection: _hideSelectedSection = false
}) => {
  const { groupedSearchResults, searchTerm } = useNodeMenuStore((state) => ({
    groupedSearchResults: state.groupedSearchResults,
    searchTerm: state.searchTerm
  }));
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  // No-op drag start for selection mode
  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      if (showCheckboxes) {
        event.preventDefault();
        return;
      }
      // Allow dragging if not in checkbox mode
      // Use unified drag serialization
      serializeDragData(
        { type: "create-node", payload: node },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "move";

      // Update global drag state
      setActiveDrag({ type: "create-node", payload: node });
    },
    [showCheckboxes, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

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

  const handleNodeClickWrapper = useCallback(
    (node: NodeMetadata) => () => {
      handleNodeClick(node);
    },
    [handleNodeClick]
  );

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  const nodesByNamespaceAll = useMemo(() => groupNodes(nodes), [nodes]);

  const computeNamespaceSelectionState = useCallback(
    (namespace: string) => {
      const allInNamespace = nodesByNamespaceAll[namespace] || [];
      const total = allInNamespace.length;
      const selected = allInNamespace.filter((n) =>
        selectedNodeTypes.includes(n.node_type)
      ).length;
      return {
        total,
        selected,
        checked: total > 0 && selected === total,
        indeterminate: selected > 0 && selected < total
      };
    },
    [nodesByNamespaceAll, selectedNodeTypes]
  );

  const toggleNamespace = useCallback(
    (namespace: string, nextChecked: boolean) => {
      if (!onSetSelection) {return;}
      const allInNamespace = nodesByNamespaceAll[namespace] || [];
      const typesInNamespace = new Set(allInNamespace.map((n) => n.node_type));
      let nextSelection: string[];
      if (nextChecked) {
        const union = new Set(selectedNodeTypes);
        typesInNamespace.forEach((t) => union.add(t));
        nextSelection = Array.from(union);
      } else {
        nextSelection = selectedNodeTypes.filter(
          (t) => !typesInNamespace.has(t)
        );
      }
      onSetSelection(nextSelection);
    },
    [nodesByNamespaceAll, onSetSelection, selectedNodeTypes]
  );

  const renderGroup = useCallback(
    (group: SearchResultGroup) => {
      // Keep all nodes visible, including selected ones
      const groupedNodes = groupNodes(group.nodes);

      return (
        <Accordion key={group.title} defaultExpanded={true} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <GroupTitle title={group.title} />
          </AccordionSummary>
          <AccordionDetails sx={{ padding: "0 0 1em 0" }}>
            {Object.entries(groupedNodes).map(
              ([namespace, nodesInNamespace]) => (
                <div key={namespace}>
                  <Box className="namespace-row">
                    <Tooltip title="Toggle all in namespace" placement="left" enterDelay={500}>
                      <span className="checkbox-cell">
                        {showCheckboxes && (
                          <Checkbox
                            size="small"
                            className="namespace-checkbox"
                            checked={
                              computeNamespaceSelectionState(namespace).checked
                            }
                            indeterminate={
                              computeNamespaceSelectionState(namespace)
                                .indeterminate
                            }
                            onChange={(e) =>
                              toggleNamespace(namespace, e.target.checked)
                            }
                            sx={{
                              color: "grey.500",
                              "&.Mui-checked, &.MuiCheckbox-indeterminate": {
                                color: "grey.400"
                              }
                            }}
                          />
                        )}
                      </span>
                    </Tooltip>
                    <Typography
                      variant="h5"
                      component="div"
                      className="namespace-text"
                    >
                      {selectedPath.length > 0
                        ? namespace.replaceAll(selectedPath + ".", "")
                        : namespace}
                    </Typography>
                  </Box>
                  <div className="node-items-group">
                    {nodesInNamespace.map((node) => (
                      <NodeItem
                        key={node.node_type}
                        node={node}
                        onDragStart={handleDragStart(node)}
                        onDragEnd={handleDragEnd}
                        onClick={handleNodeClickWrapper(node)}
                        showCheckbox={showCheckboxes}
                        isSelected={selectedNodeTypes.includes(node.node_type)}
                        onToggleSelection={onToggleSelection}
                      />
                    ))}
                  </div>
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
      handleNodeClickWrapper,
      computeNamespaceSelectionState,
      toggleNamespace
    ]
  );

  const elements = useMemo(() => {
    // If we're searching, use the grouped results
    if (searchTerm) {
      return groupedSearchResults.map(renderGroup);
    }

    // Otherwise use the original namespace-based grouping, keeping all nodes visible
    return Object.entries(groupNodes(nodes)).flatMap(
        ([namespace, nodesInNamespace], namespaceIndex) => {
          let textForNamespaceHeader = namespace; // Default to full namespace string

          if (selectedPath && selectedPath === namespace) {
            // If the current group of nodes IS the selected namespace, display its last part.
            // e.g., selectedPath="A.B", namespace="A.B" -> display "B"
            textForNamespaceHeader = namespace.split(".").pop() || namespace;
          } else if (selectedPath && namespace.startsWith(selectedPath + ".")) {
            // If the current group of nodes is a sub-namespace of the selected one, display the relative path.
            // e.g., selectedPath="A", namespace="A.B.C" -> display "B.C"
            textForNamespaceHeader = namespace.substring(
              selectedPath.length + 1
            );
          }
          // If selectedPath is empty (root is selected), textForNamespaceHeader remains the full 'namespace'.
          // If namespace is not a child of selectedPath and not equal to selectedPath,
          // it also remains the full 'namespace'.

          const nsState = computeNamespaceSelectionState(namespace);
          const itemsForNamespace: JSX.Element[] = [
            <Box
              key={`namespace-${namespace}-${namespaceIndex}`}
              className="namespace-row"
            >
              <Tooltip title="Toggle all in namespace" placement="left" enterDelay={500}>
                <span className="checkbox-cell">
                  {showCheckboxes && (
                    <Checkbox
                      size="small"
                      className="namespace-checkbox"
                      checked={nsState.checked}
                      indeterminate={nsState.indeterminate}
                      onChange={(e) =>
                        toggleNamespace(namespace, e.target.checked)
                      }
                      sx={{
                          color: "grey.500",
                        "&.Mui-checked, &.MuiCheckbox-indeterminate": {
                          color: "grey.400"
                        }
                      }}
                    />
                  )}
                </span>
              </Tooltip>
              <Typography
                variant="h5"
                component="div"
                className="namespace-text"
              >
                {textForNamespaceHeader}
              </Typography>
            </Box>,
            <div
              key={`nodes-${namespace}-${namespaceIndex}`}
              className="node-items-group"
            >
              {nodesInNamespace.map((node) => (
                <NodeItem
                  key={node.node_type}
                  node={node}
                  onDragStart={handleDragStart(node)}
                  onDragEnd={handleDragEnd}
                  onClick={handleNodeClickWrapper(node)}
                  showCheckbox={showCheckboxes}
                  isSelected={selectedNodeTypes.includes(node.node_type)}
                  onToggleSelection={onToggleSelection}
                />
              ))}
            </div>
          ];

          return itemsForNamespace;
        }
      );
  }, [
    searchTerm,
    nodes,
    groupedSearchResults,
    renderGroup,
    selectedPath,
    handleDragStart,
    handleDragEnd,
    handleNodeClickWrapper,
    showCheckboxes,
    selectedNodeTypes,
    onToggleSelection,
    computeNamespaceSelectionState,
    toggleNamespace
  ]);

  return (
    <div className="nodes" css={listStyles()}>
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
