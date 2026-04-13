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
  Box,
  Popover,
  PopoverOrigin
} from "@mui/material";
import isEqual from "fast-deep-equal";
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
import { ScrollArea, Tooltip, Text, Caption, FlexRow, FlexColumn, LoadingSpinner, ToolbarIconButton, EditorButton, Chip } from "../../ui_primitives";

// Popover dimensions
const POPOVER_WIDTH = 680;
const POPOVER_HEIGHT = 600;

const toolsSelectorStyles = (theme: Theme) =>
  css({
    ".MuiButton-endIcon": {
      marginLeft: 0
    },
    ".selector-content": {
      height: "100%",
      overflow: "hidden"
    },
    ".nodes-container": {
      flex: 1,
      padding: "0 8px"
    },
    ".loading-container": {
      padding: theme.spacing(4),
      flex: 1
    },
    ".no-nodes-message": {
      padding: theme.spacing(4),
      color: theme.vars.palette.grey[200],
      textAlign: "center",
      flex: 1
    },
    // Selected panel styles
    ".selected-panel": {
      height: "100%",
      overflow: "hidden"
    },
    ".selected-header": {
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
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
    // Optimized: Use for...in to avoid intermediate array allocations
    // from Object.values(), .filter(), and .reduce() on large metadata objects.
    const tools: Record<string, NodeMetadata> = {};
    for (const key in metadata) {
      const node = metadata[key];
      if (node.expose_as_tool) {
        tools[node.node_type] = node;
      }
    }
    return tools;
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
  const searchTerm = useNodeToolsMenuStore((state) => state.searchTerm);
  const setSearchTerm = useNodeToolsMenuStore((state) => state.setSearchTerm);
  const searchResults = useNodeToolsMenuStore((state) => state.searchResults);
  const isLoading = useNodeToolsMenuStore((state) => state.isLoading);

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
        delay={TOOLTIP_ENTER_DELAY}
      >
        <EditorButton
          ref={buttonRef}
          className={`node-tools-button ${selectedCount > 0 ? "active" : ""}`}
          onClick={handleClick}
          density="compact"
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
                overflow: "hidden"
              }
            }
          }}
      >
        {/* Header with Search */}
        <FlexRow
          gap={1}
          align="center"
          sx={{
            p: 1.5,
            pl: 2,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
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
        </FlexRow>

        {/* Main Content - Split Panel */}
        <FlexRow sx={{ flex: 1, overflow: "hidden" }}>
          {/* Left Panel - Available Nodes */}
          <FlexColumn
            sx={{
              flex: 1,
              minWidth: 0,
              bgcolor: "background.paper"
            }}
          >
            <FlexColumn className="selector-content" sx={{ flex: 1, overflow: "hidden" }}>
              <ScrollArea className="nodes-container" fullHeight>
                {isLoading ? (
                  <FlexRow className="loading-container" justify="center" align="center" fullWidth fullHeight>
                    <LoadingSpinner size="small" />
                  </FlexRow>
                ) : nodesForDisplay.length === 0 ? (
                  <FlexColumn className="no-nodes-message" align="center" justify="center" fullWidth fullHeight>
                    <Text size="small">
                      {searchTerm.trim().length > 0
                        ? "No nodes match your search."
                        : "No nodes available."}
                    </Text>
                  </FlexColumn>
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
              </ScrollArea>
            </FlexColumn>
          </FlexColumn>

          {/* Right Panel - Selected Nodes */}
          <FlexColumn
            sx={{
              width: 280,
              flexShrink: 0,
              borderLeft: `1px solid ${theme.vars.palette.grey[800]}`,
              bgcolor: theme.vars.palette.grey[900]
            }}
          >
            <FlexColumn className="selected-panel" fullHeight>
              <FlexRow className="selected-header" justify="space-between" align="center" fullWidth>
                <FlexRow gap={0.5} align="center">
                  <Text size="smaller" weight={600} className="selected-title">
                    Selected
                  </Text>
                  <Caption className="selected-count">
                    ({selectedCount})
                  </Caption>
                </FlexRow>
              </FlexRow>
              <FlexColumn className="selected-list" fullWidth>
                {selectedCount === 0 ? (
                  <FlexColumn className="empty-selection" align="flex-start" justify="flex-start" fullWidth fullHeight>
                    <Text size="small" weight={600} className="empty-title">
                      Node Tools
                    </Text>
                    <Caption color="warning" sx={{ fontSize: "var(--fontSizeTiny)" }}>
                       EXPERIMENTAL
                    </Caption>
                    <Text size="small" className="empty-desc">
                      Enable nodes as tools for the AI assistant to use during conversations.
                    </Text>
                    <Text size="small" className="empty-desc">
                      These nodes can automatically run to generate images, audio, search the web, and more.
                    </Text>
                    <Caption className="empty-hint">
                      Click nodes on the left to add them.
                    </Caption>
                  </FlexColumn>
                ) : (
                  selectedNodeMetadatas.map((node) => {
                    const outputType =
                      node.outputs.length > 0 ? node.outputs[0].type.type : "";
                    return (
                      <FlexRow
                        key={node.node_type}
                        className="selected-item"
                        align="center"
                        gap={0.75}
                      >
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
                          delay={500}
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
                          <Text
                            className="selected-item-name"
                            onClick={nodeHandlers.scrollToHandlers[node.namespace]}
                            style={{ cursor: "pointer" }}
                            size="small"
                          >
                            {node.title}
                          </Text>
                        </Tooltip>
                        <ToolbarIconButton
                          tooltip="Remove"
                          className="remove-btn"
                          onClick={nodeHandlers.toggleHandlers[node.node_type]}
                          icon={<Close sx={{ fontSize: "var(--fontSizeSmall)" }} />}
                          sx={{ color: theme.vars.palette.grey[500] }}
                        />
                      </FlexRow>
                    );
                  })
                )}
              </FlexColumn>
            </FlexColumn>
          </FlexColumn>
        </FlexRow>
      </Popover>
    </>
  );
};

export default memo(NodeToolsSelector, isEqual);
