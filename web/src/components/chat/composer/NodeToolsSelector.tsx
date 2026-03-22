/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useLayoutEffect
} from "react";
import {
  Button,
  Typography,
  Tooltip,
  CircularProgress,
  Chip,
  Box,
  Popover,
  PopoverOrigin,
  IconButton
} from "@mui/material";
import isEqual from "lodash/isEqual";
import { Widgets, Close } from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useNodeToolsMenuStore } from "../../../stores/NodeMenuStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import SearchInput from "../../search/SearchInput";
import RenderNodesSelectable from "../../node_menu/RenderNodesSelectable";
import { IconForType } from "../../../config/data_types";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import useMetadataStore from "../../../stores/MetadataStore";

// Popover dimensions
const POPOVER_WIDTH = 680;
const POPOVER_HEIGHT = 600;

const toolsSelectorStyles = (theme: Theme) =>
  css({
    ".MuiButton-endIcon": {
      marginLeft: 0
    },
    ".selector-content": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden"
    },
    ".nodes-container": {
      flex: 1,
      overflow: "auto",
      padding: "0 8px"
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing(4),
      flex: 1
    },
    ".no-nodes-message": {
      padding: theme.spacing(4),
      color: theme.vars.palette.grey[200],
      textAlign: "center",
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    // Selected panel styles
    ".selected-panel": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden"
    },
    ".selected-header": {
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0
    },
    ".selected-title": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".selected-count": {
      fontSize: "var(--fontSizeTiny)",
      color: theme.vars.palette.grey[500],
      marginLeft: "6px"
    },
    ".selected-list": {
      flex: 1,
      overflow: "auto",
      padding: "4px"
    },
    ".selected-item": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 6px",
      borderRadius: "4px",
      marginBottom: "2px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        "& .remove-btn": {
          opacity: 1
        }
      }
    },
    ".selected-item-name": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.grey[100],
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      cursor: "pointer",
      transition: "color 150ms ease",
      "&:hover": {
        color: theme.vars.palette.primary.main
      }
    },
    ".remove-btn": {
      opacity: 0.5,
      padding: "2px",
      transition: "opacity 150ms ease"
    },
    ".empty-selection": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      height: "100%",
      padding: "12px",
      textAlign: "left",
      color: theme.vars.palette.grey[400],
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: 1.5,
      "& .empty-title": {
        fontWeight: 600,
        marginBottom: "8px",
        color: theme.vars.palette.grey[300]
      },
      "& .empty-desc": {
        marginBottom: "12px",
        color: theme.vars.palette.grey[400]
      },
      "& .empty-hint": {
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.grey[500],
        fontStyle: "italic"
      }
    }
  });

interface NodeToolsSelectorProps {
  value: string[];
  onChange: (nodeTypes: string[]) => void;
}

const NodeToolsSelector: React.FC<NodeToolsSelectorProps> = ({
  value,
  onChange
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const theme = useTheme();
  const metadata = useMetadataStore((state) => state.metadata);
  const nodeTools = useMemo(() => {
    return Object.values(metadata)
      .filter((node) => node.expose_as_tool)
      .reduce((acc, node) => {
        acc[node.node_type] = node;
        return acc;
      }, {} as Record<string, NodeMetadata>);
  }, [metadata]);

  const selectedNodeTypes = useMemo(
    () =>
      (value || []).filter((nodeType) => {
        return nodeType in nodeTools;
      }),
    [value, nodeTools]
  );

  // Ensure selected nodes are always included in the list passed to the renderer
  const selectedNodeMetadatas = useMemo(() => {
    return selectedNodeTypes
      .map((nodeType) => metadata[nodeType])
      .filter((node): node is NodeMetadata => node !== undefined);
  }, [selectedNodeTypes, metadata]);

  // Use NodeMenuStore for search functionality
  const {
    searchTerm,
    setSearchTerm,
    searchResults,
    isLoading
  } = useNodeToolsMenuStore((state) => ({
    searchTerm: state.searchTerm,
    setSearchTerm: state.setSearchTerm,
    searchResults: state.searchResults,
    isLoading: state.isLoading
  }));

  // Show all nodes in the left panel, including selected ones (they'll show as selected/disabled)
  const nodesForDisplay = useMemo(() => {
    return searchResults;
  }, [searchResults]);

  const handleClick = useCallback(() => {
    setIsMenuOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsMenuOpen(false);
    setSearchTerm("");
  }, [setSearchTerm]);

  const handleToggleNode = useCallback(
    (nodeType: string) => {
      const newNodeTypes = selectedNodeTypes.includes(nodeType)
        ? selectedNodeTypes.filter((type) => type !== nodeType)
        : [...selectedNodeTypes, nodeType];
      onChange(newNodeTypes);
    },
    [selectedNodeTypes, onChange]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
    },
    [setSearchTerm]
  );

  const handleSetSelection = useCallback(
    (newNodeTypes: string[]) => {
      const filtered = newNodeTypes.filter((nodeType) => nodeType in nodeTools);
      onChange(filtered);
    },
    [nodeTools, onChange]
  );

  // Count of selected node tools
  const selectedCount = selectedNodeTypes.length;
  const memoizedStyles = useMemo(() => toolsSelectorStyles(theme), [theme]);
  
  // State for scrolling to namespace when clicking on right side
  const [scrollToNamespace, setScrollToNamespace] = useState<string | null>(null);
  
  const handleScrollToNamespace = useCallback((namespace: string) => {
    setScrollToNamespace(namespace);
  }, []);

  const handleScrollToNamespaceComplete = useCallback(() => {
    setScrollToNamespace(null);
  }, []);

  // Memoize handlers for selected nodes to prevent re-renders
  const nodeHandlers = useMemo(() => {
    const handlers: {
      toggleHandlers: Record<string, () => void>;
      scrollToHandlers: Record<string, () => void>;
    } = { toggleHandlers: {}, scrollToHandlers: {} };

    for (const node of selectedNodeMetadatas) {
      handlers.toggleHandlers[node.node_type] = () => handleToggleNode(node.node_type);
      handlers.scrollToHandlers[node.namespace] = () => handleScrollToNamespace(node.namespace);
    }

    return handlers;
  }, [selectedNodeMetadatas, handleToggleNode, handleScrollToNamespace]);

  // Positioning logic for Popover (same pattern as ModelMenuDialogBase)
  const [positionConfig, setPositionConfig] = useState<{
    anchorOrigin: PopoverOrigin;
    transformOrigin: PopoverOrigin;
  }>({
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" }
  });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < POPOVER_HEIGHT && rect.top > POPOVER_HEIGHT) {
      setPositionConfig({
        anchorOrigin: { vertical: "top", horizontal: "left" },
        transformOrigin: { vertical: "bottom", horizontal: "left" }
      });
    } else {
      setPositionConfig({
        anchorOrigin: { vertical: "bottom", horizontal: "left" },
        transformOrigin: { vertical: "top", horizontal: "left" }
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (isMenuOpen) {
      updatePosition();
      setSearchTerm("");
      window.addEventListener("resize", updatePosition);
      return () => window.removeEventListener("resize", updatePosition);
    }
  }, [isMenuOpen, updatePosition, setSearchTerm]);

  return (
    <>
      <Tooltip
        title={
          selectedCount > 0
            ? `${selectedCount} node tools selected`
            : "Select Node Tools"
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          ref={buttonRef}
          className={`node-tools-button ${selectedCount > 0 ? "active" : ""}`}
          onClick={handleClick}
          size="small"
          startIcon={<Widgets sx={{ fontSize: 18 }} />}
          endIcon={
            selectedCount > 0 && (
              <Chip
                size="small"
                label={selectedCount}
                sx={{
                  marginLeft: "-4px",
                  backgroundColor: theme.vars.palette.grey[700],
                  color: theme.vars.palette.grey[200],
                  borderRadius: "6px",
                  height: "18px",
                  "& .MuiChip-label": {
                    padding: "0 5px",
                    fontSize: "0.7rem"
                  }
                }}
              />
            )
          }
          sx={(theme) => ({
            color: theme.vars.palette.grey[300],
            padding: "0.25em 0.25em",
            "&:hover": {
              backgroundColor: theme.vars.palette.grey[700]
            },
            "&.active": {
              color: theme.vars.palette.grey[100],
              "& .MuiSvgIcon-root": {
                color: theme.vars.palette.grey[100]
              }
            }
          })}
        />
      </Tooltip>

      <Popover
        css={memoizedStyles}
        open={isMenuOpen}
        anchorEl={buttonRef.current}
        onClose={handleClose}
        anchorOrigin={positionConfig.anchorOrigin}
        transformOrigin={positionConfig.transformOrigin}
        slotProps={{
          paper: {
            elevation: 24,
            style: {
              width: `${POPOVER_WIDTH}px`,
              height: `${POPOVER_HEIGHT}px`,
              maxHeight: "90vh",
              maxWidth: "100vw",
              borderRadius: theme.vars.rounded.dialog,
              background: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.divider}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }
          }
        }}
      >
        {/* Header with Search */}
        <Box
          sx={{
            p: 1.5,
            pl: 2,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
            background: theme.vars.palette.background.paper
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SearchInput
              onSearchChange={handleSearchChange}
              placeholder="Search nodes..."
              debounceTime={150}
              focusSearchInput={isMenuOpen}
              focusOnTyping
              width="100%"
              onPressEscape={handleClose}
            />
          </Box>
        </Box>

        {/* Main Content - Split Panel */}
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left Panel - Available Nodes */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              bgcolor: "background.paper"
            }}
          >
            <Box className="selector-content" sx={{ flex: 1, overflow: "hidden" }}>
              <div className="nodes-container">
                {isLoading ? (
                  <div className="loading-container">
                    <CircularProgress size={24} />
                  </div>
                ) : nodesForDisplay.length === 0 ? (
                  <div className="no-nodes-message">
                    <Typography variant="body2">
                      {searchTerm.trim().length > 0
                        ? "No nodes match your search."
                        : "No nodes available."}
                    </Typography>
                  </div>
                ) : (
                  <RenderNodesSelectable
                    nodes={nodesForDisplay}
                    showCheckboxes={true}
                    selectedNodeTypes={selectedNodeTypes}
                    onToggleSelection={handleToggleNode}
                    onSetSelection={handleSetSelection}
                    hideSelectedSection={true}
                    scrollToNamespace={scrollToNamespace}
                    onScrollToNamespaceComplete={handleScrollToNamespaceComplete}
                  />
                )}
              </div>
            </Box>
          </Box>

          {/* Right Panel - Selected Nodes */}
          <Box
            sx={{
              width: 280,
              flexShrink: 0,
              borderLeft: `1px solid ${theme.vars.palette.grey[800]}`,
              bgcolor: theme.vars.palette.grey[900],
              display: "flex",
              flexDirection: "column"
            }}
          >
            <div className="selected-panel">
              <div className="selected-header">
                <span>
                  <span className="selected-title">Selected</span>
                  <span className="selected-count">({selectedCount})</span>
                </span>
              </div>
              <div className="selected-list">
                {selectedCount === 0 ? (
                  <div className="empty-selection">
                    <span className="empty-title">Node Tools</span>
                    <Typography variant="caption" sx={{ color: theme.vars.palette.warning.main, fontSize: "var(--fontSizeTiny)" }}>
                       EXPERIMENTAL
                    </Typography>
                    <span className="empty-desc">
                      Enable nodes as tools for the AI assistant to use during conversations.
                    </span>
                    <span className="empty-desc">
                      These nodes can automatically run to generate images, audio, search the web, and more.
                    </span>
                    <span className="empty-hint">
                      Click nodes on the left to add them.
                    </span>
                  </div>
                ) : (
                  selectedNodeMetadatas.map((node) => {
                    const outputType =
                      node.outputs.length > 0 ? node.outputs[0].type.type : "";
                    return (
                      <div key={node.node_type} className="selected-item">
                        <IconForType
                          iconName={outputType}
                          containerStyle={{
                            borderRadius: "2px",
                            marginLeft: "0",
                            marginTop: "0"
                          }}
                          bgStyle={{
                            backgroundColor: theme.vars.palette.grey[800],
                            margin: "0",
                            padding: "1px",
                            borderRadius: "2px",
                            width: "20px",
                            height: "20px"
                          }}
                          svgProps={{
                            width: "15px",
                            height: "15px"
                          }}
                        />
                        <Tooltip
                          title="Click to scroll to namespace"
                          enterDelay={500}
                          placement="left"
                          slotProps={{
                            popper: {
                              sx: { zIndex: 2000 }
                            },
                            tooltip: {
                              sx: {
                                bgcolor: "grey.800",
                                color: "grey.100"
                              }
                            }
                          }}
                        >
                          <span
                            className="selected-item-name"
                            onClick={nodeHandlers.scrollToHandlers[node.namespace]}
                            style={{ cursor: "pointer" }}
                          >
                            {node.title}
                          </span>
                        </Tooltip>
                        <Tooltip
                          title="Remove"
                          enterDelay={300}
                          placement="left"
                          slotProps={{
                            popper: {
                              sx: { zIndex: 2000 }
                            },
                            tooltip: {
                              sx: {
                                bgcolor: "grey.800",
                                color: "grey.100"
                              }
                            }
                          }}
                        >
                          <IconButton
                            size="small"
                            className="remove-btn"
                            onClick={nodeHandlers.toggleHandlers[node.node_type]}
                            aria-label={`Remove ${node.title}`}
                            sx={{ color: theme.vars.palette.grey[500] }}
                          >
                            <Close sx={{ fontSize: "var(--fontSizeSmall)" }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default memo(NodeToolsSelector, isEqual);
