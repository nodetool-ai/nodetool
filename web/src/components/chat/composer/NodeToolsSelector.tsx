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
import { Extension, Close } from "@mui/icons-material";
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
const POPOVER_WIDTH = 560;
const POPOVER_HEIGHT = 480;

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
      .filter(Boolean) as NodeMetadata[];
  }, [selectedNodeTypes, metadata]);

  // Use NodeMenuStore for search functionality
  const {
    searchTerm,
    setSearchTerm,
    searchResults,
    isLoading,
    selectedPath,
    hoveredNode
  } = useNodeToolsMenuStore((state) => ({
    searchTerm: state.searchTerm,
    setSearchTerm: state.setSearchTerm,
    searchResults: state.searchResults,
    isLoading: state.isLoading,
    selectedPath: state.selectedPath,
    hoveredNode: state.hoveredNode
  }));

  // Union of available nodes and selected nodes to always show selected at the top
  const allNodesForDisplay = useMemo(() => {
    const nodeTypeToNode = new Map<string, NodeMetadata>();
    // Selected first to preserve order preference when rendered
    selectedNodeMetadatas.forEach((node) => {
      if (!nodeTypeToNode.has(node.node_type)) { nodeTypeToNode.set(node.node_type, node); }
    });
    searchResults.forEach((node) => {
      if (!nodeTypeToNode.has(node.node_type)) { nodeTypeToNode.set(node.node_type, node); }
    });
    return Array.from(nodeTypeToNode.values());
  }, [selectedNodeMetadatas, searchResults]);

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
          startIcon={<Extension fontSize="small" />}
          endIcon={
            selectedCount > 0 && (
              <Chip
                size="small"
                label={selectedCount}
                sx={{
                  backgroundColor: theme.vars.palette.grey[700],
                  color: theme.vars.palette.grey[200],
                  borderRadius: "6px",
                  height: "18px",
                  "& .MuiChip-label": {
                    padding: "0 5px",
                    fontSize: "0.75rem"
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

        {/* Main Content */}
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Node List */}
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
                ) : searchResults.length === 0 && selectedCount === 0 ? (
                  <div className="no-nodes-message">
                    <Typography variant="body2">
                      {(() => {
                        const hasNamespaceSelected = selectedPath.length > 0;
                        const searchLength = searchTerm.trim().length;

                        if (hasNamespaceSelected && searchLength === 0) {
                          return "No nodes available.";
                        } else if (hasNamespaceSelected && searchLength > 0) {
                          return "No nodes match your search.";
                        } else {
                          return "No nodes match your search.";
                        }
                      })()}
                    </Typography>
                  </div>
                ) : (
                  <RenderNodesSelectable
                    nodes={allNodesForDisplay}
                    showCheckboxes={true}
                    selectedNodeTypes={selectedNodeTypes}
                    onToggleSelection={handleToggleNode}
                    onSetSelection={handleSetSelection}
                  />
                )}
              </div>
            </Box>
          </Box>

          {/* Right Pane - Node Info (compact) */}
          {hoveredNode && (
            <Box
              sx={{
                width: 180,
                flexShrink: 0,
                borderLeft: `1px solid ${theme.vars.palette.divider}`,
                overflow: "auto",
                bgcolor: theme.vars.palette.background.default,
                p: 1
              }}
            >
              <NodeInfo
                nodeMetadata={hoveredNode}
                showConnections={false}
                menuWidth={160}
              />
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default memo(NodeToolsSelector, isEqual);
