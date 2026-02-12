/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
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
  scrollToNamespace?: string | null;
  onScrollToNamespaceComplete?: () => void;
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
        "outline-color 120ms ease, background-color 120ms ease, border-color 120ms ease",
      "& svg": {
        opacity: 0.75
      }
    },
    ".node.selected .node-button": {
      backgroundColor: "var(--palette-grey-850)",
      opacity: 0.7,
      "&:hover": {
        opacity: 0.9
      }
    },
    // Checkmark icon for selected nodes
    ".node.selected .node-button .MuiSvgIcon-root": {
      flexShrink: 0
    },
    // Section header for "Selected" section
    ".section-header": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 4px 6px",
      marginBottom: "4px",
      borderBottom: "1px solid var(--palette-grey-700)",
      "& .section-title": {
        fontSize: "0.7em",
        fontWeight: 600,  
        color: "var(--palette-grey-400)",
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      },
      "& .section-count": {
        fontSize: "0.7em",
        color: "var(--palette-grey-500)"
      }
    },
    // Namespace styling - cleaner, more subtle
    ".namespace-text": {
      color: "var(--palette-grey-100)",
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
      borderBottom: "1px solid var(--palette-grey-800)",
      minHeight: "32px",
      transition: "background-color 150ms ease",
      "&:hover": {
        backgroundColor: "var(--palette-grey-900)"
      },
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
      border: "none",
      flex: 1,
      minWidth: 0
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
  const tooltips: Record<string, string> = {
    Name: "Exact matches in node names",
    Namespace: "Matches in node namespaces and tags",
    Description: "Matches found in node descriptions. Better results on top."
  };

  return (
    <Tooltip
      title={tooltips[title] || ""}
      placement="bottom"
      enterDelay={200}
      slotProps={{
        popper: { sx: { zIndex: 2000 } },
        tooltip: { sx: { bgcolor: "grey.800", color: "grey.100" } }
      }}
    >
      <Typography
        variant="h6"
        component="div"
        sx={{
          color: "var(--palette-primary-main)",
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
  hideSelectedSection: _hideSelectedSection = false,
  scrollToNamespace,
  onScrollToNamespaceComplete
}) => {
  const { groupedSearchResults, searchTerm } = useNodeMenuStore((state) => ({
    groupedSearchResults: state.groupedSearchResults,
    searchTerm: state.searchTerm
  }));
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  
  // Track expanded namespaces when no search term
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(
    new Set()
  );
  
  // Refs for namespace elements to enable scrolling
  const namespaceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Handle scroll to namespace when prop changes
  useEffect(() => {
    if (scrollToNamespace) {
      // Expand the namespace first
      setExpandedNamespaces((prev) => {
        const next = new Set(prev);
        next.add(scrollToNamespace);
        return next;
      });

      // Scroll to the namespace element after a short delay to allow expansion
      const timeoutId = setTimeout(() => {
        const element = namespaceRefs.current.get(scrollToNamespace);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        // Signal completion
        onScrollToNamespaceComplete?.();
      }, 50);

      // Cleanup timeout
      return () => clearTimeout(timeoutId);
    }
  }, [scrollToNamespace, onScrollToNamespaceComplete]);
  
  const toggleNamespaceExpansion = useCallback((namespace: string) => {
    setExpandedNamespaces((prev) => {
      const next = new Set(prev);
      if (next.has(namespace)) {
        next.delete(namespace);
      } else {
        next.add(namespace);
      }
      return next;
    });
  }, []);

  // No-op drag start for selection mode
  const handleDragStart = useCallback(
    (node: NodeMetadata, event: React.DragEvent<HTMLDivElement>) => {
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

  const selectedNodeTypesSet = useMemo(() => {
    return new Set(selectedNodeTypes);
  }, [selectedNodeTypes]);

  const { selectedPath } = useNodeMenuStore((state) => ({
    selectedPath: state.selectedPath.join(".")
  }));

  const nodesByNamespaceAll = useMemo(() => groupNodes(nodes), [nodes]);

  const computeNamespaceSelectionState = useCallback(
    (namespace: string) => {
      const allInNamespace = nodesByNamespaceAll[namespace] || [];
      const total = allInNamespace.length;
      const selected = allInNamespace.filter((n) =>
        selectedNodeTypesSet.has(n.node_type)
      ).length;
      return {
        total,
        selected,
        checked: total > 0 && selected === total,
        indeterminate: selected > 0 && selected < total
      };
    },
    [nodesByNamespaceAll, selectedNodeTypesSet]
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
              ([namespace, nodesInNamespace]) => {
                const nsState = computeNamespaceSelectionState(namespace);
                return (
                  <div key={namespace}>
                    <Box className="namespace-row">
                      <Tooltip
                        title="Toggle all in namespace"
                        placement="left"
                        enterDelay={500}
                        slotProps={{
                          popper: { sx: { zIndex: 2000 } },
                          tooltip: { sx: { bgcolor: "grey.800", color: "grey.100" } }
                        }}
                      >
                        <span className="checkbox-cell">
                          {showCheckboxes && (
                            <Checkbox
                              size="small"
                              className="namespace-checkbox"
                              checked={nsState.checked}
                              indeterminate={nsState.indeterminate}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleNamespace(namespace, e.target.checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              sx={{
                                color: "var(--palette-grey-500)",
                                "&.Mui-checked, &.MuiCheckbox-indeterminate": {
                                  color: "var(--palette-grey-400)"
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
                        sx={{
                          flex: 1,
                          minWidth: 0
                        }}
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
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onClick={handleNodeClick}
                          showCheckbox={showCheckboxes}
                          isSelected={selectedNodeTypesSet.has(node.node_type)}
                          onToggleSelection={onToggleSelection}
                          showDescriptionTooltip={true}
                        />
                      ))}
                    </div>
                  </div>
                );
              }
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
      selectedNodeTypesSet,
      onToggleSelection,
      handleNodeClick,
      computeNamespaceSelectionState,
      toggleNamespace
    ]
  );

  const elements = useMemo(() => {
    // If we're searching, use the grouped results (show nodes)
    if (searchTerm) {
      return groupedSearchResults.map(renderGroup);
    }

    // Otherwise, only show namespaces (collapsible)
    return Object.entries(nodesByNamespaceAll).map(
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
          const isExpanded = expandedNamespaces.has(namespace);
          
          return (
            <div
              key={`namespace-wrapper-${namespace}-${namespaceIndex}`}
              ref={(el) => {
                if (el) {
                  namespaceRefs.current.set(namespace, el);
                } else {
                  namespaceRefs.current.delete(namespace);
                }
              }}
            >
              <Box
                className="namespace-row"
              >
                <Tooltip
                  title="Toggle all in namespace"
                  placement="left"
                  enterDelay={500}
                  slotProps={{
                    popper: { sx: { zIndex: 2000 } },
                    tooltip: { sx: { bgcolor: "grey.800", color: "grey.100" } }
                  }}
                >
                  <span className="checkbox-cell">
                    {showCheckboxes && (
                      <Checkbox
                        size="small"
                        className="namespace-checkbox"
                        checked={nsState.checked}
                        indeterminate={nsState.indeterminate}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleNamespace(namespace, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        sx={{
                          color: "var(--palette-grey-500)",
                          "&.Mui-checked, &.MuiCheckbox-indeterminate": {
                            color: "var(--palette-grey-400)"
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
                  onClick={() => toggleNamespaceExpansion(namespace)}
                  sx={{
                    cursor: "pointer",
                    userSelect: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <ExpandMoreIcon
                    sx={{
                      fontSize: "1rem",
                      transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 0.2s ease"
                    }}
                  />
                  {textForNamespaceHeader}
                </Typography>
              </Box>
              {isExpanded && (
                <div
                  className="node-items-group"
                >
                  {nodesInNamespace.map((node) => (
                    <NodeItem
                      key={node.node_type}
                      node={node}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onClick={handleNodeClick}
                      showCheckbox={showCheckboxes}
                      isSelected={selectedNodeTypesSet.has(node.node_type)}
                      onToggleSelection={onToggleSelection}
                      showDescriptionTooltip={true}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        }
      );
  }, [
    searchTerm,
    nodesByNamespaceAll,
    groupedSearchResults,
    renderGroup,
    selectedPath,
    handleDragStart,
    handleDragEnd,
    handleNodeClick,
    showCheckboxes,
    selectedNodeTypesSet,
    onToggleSelection,
    computeNamespaceSelectionState,
    toggleNamespace,
    expandedNamespaces,
    toggleNamespaceExpansion
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
