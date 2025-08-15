/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo, useState, useRef } from "react";
import {
  Button,
  Typography,
  Box,
  Tooltip,
  CircularProgress,
  Chip,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle
} from "@mui/material";
import { isEqual } from "lodash";
import { Extension, Close } from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import useNodeMenuStore from "../../../stores/NodeMenuStore";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import SearchInput from "../../search/SearchInput";
import RenderNodesSelectable from "../../node_menu/RenderNodesSelectable";
import NodeInfo from "../../node_menu/NodeInfo";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import useMetadataStore from "../../../stores/MetadataStore";

const toolsSelectorStyles = (theme: Theme) =>
  css({
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      margin: 0,
      padding: theme.spacing(4, 4),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      h4: {
        margin: 0,
        fontSize: theme.fontSizeNormal,
        fontWeight: 500,
        color: theme.vars.palette.grey[100]
      }
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(2),
      color: theme.vars.palette.grey[500]
    },
    ".selector-grid": {
      display: "flex",
      flexDirection: "row",
      gap: theme.spacing(2),
      alignItems: "stretch"
    },
    ".left-pane": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minWidth: 0
    },
    ".right-pane": {
      width: 360,
      minWidth: 320,
      maxWidth: 420,
      borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
      padding: theme.spacing(0, 1.5, 1.5, 1.5),
      background: "transparent",
      position: "sticky",
      top: 0,
      alignSelf: "flex-start"
    },
    ".selector-content": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      paddingTop: theme.spacing(1)
    },
    ".search-toolbar": {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: "0.5em",
      minHeight: "40px",
      flexGrow: 0,
      overflow: "hidden",
      width: "60%",
      margin: 0,
      padding: ".5em 1em .5em .7em",
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      ".search-input-container": {
        minWidth: "170px",
        flex: 1
      }
    },
    ".selection-info": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      padding: "0.5em 1em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: "transparent",
      ".selected-count": {
        backgroundColor: "var(--palette-primary-main)",
        color: theme.vars.palette.grey[1000],
        fontSize: "0.75rem",
        height: "20px",
        "& .MuiChip-label": {
          padding: "0 6px"
        }
      }
    },
    ".nodes-container": {
      flex: 1,
      overflow: "auto",
      padding: "0 1em"
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
  const { searchTerm, setSearchTerm, searchResults, isLoading, selectedPath } =
    useStoreWithEqualityFn(
      useNodeMenuStore,
      (state) => ({
        searchTerm: state.searchTerm,
        setSearchTerm: state.setSearchTerm,
        searchResults: state.searchResults,
        isLoading: state.isLoading,
        selectedPath: state.selectedPath
      }),
      shallow
    );

  const hoveredNode = useStoreWithEqualityFn(
    useNodeMenuStore,
    (state) => state.hoveredNode,
    Object.is
  );

  const availableNodes = useMemo(() => {
    return searchResults.filter((node: NodeMetadata) => node.expose_as_tool);
  }, [searchResults]);

  // Union of available nodes and selected nodes to always show selected at the top
  const allNodesForDisplay = useMemo(() => {
    const nodeTypeToNode = new Map<string, NodeMetadata>();
    // Selected first to preserve order preference when rendered
    selectedNodeMetadatas.forEach((node) => {
      if (!nodeTypeToNode.has(node.node_type))
        nodeTypeToNode.set(node.node_type, node);
    });
    availableNodes.forEach((node) => {
      if (!nodeTypeToNode.has(node.node_type))
        nodeTypeToNode.set(node.node_type, node);
    });
    return Array.from(nodeTypeToNode.values());
  }, [selectedNodeMetadatas, availableNodes]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
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
                  marginLeft: 1,
                  backgroundColor: theme.palette.primary.light,
                  color: theme.palette.grey[100]
                }}
              />
            )
          }
          sx={(theme) => ({
            color: theme.vars.palette.grey[0],
            padding: "0.25em 0.75em",
            "&:hover": {
              backgroundColor: theme.vars.palette.grey[500]
            },
            "&.active": {
              borderColor: "var(--palette-primary-main)",
              color: "var(--palette-primary-main)",
              "& .MuiSvgIcon-root": {
                color: "var(--palette-primary-main)"
              }
            }
          })}
        />
      </Tooltip>

      <Dialog
        css={memoizedStyles}
        className="node-tools-selector-dialog"
        open={isMenuOpen}
        onClose={handleClose}
        aria-labelledby="node-tools-selector-title"
        slotProps={{
          backdrop: {
            style: { backdropFilter: "blur(20px)" }
          }
        }}
        sx={(theme) => ({
          "& .MuiDialog-paper": {
            width: "92%",
            maxWidth: "1000px",
            margin: "auto",
            borderRadius: 1.5,
            background: "transparent",
            border: `1px solid ${theme.vars.palette.grey[700]}`
          }
        })}
      >
        <DialogTitle className="dialog-title">
          <Typography variant="h4" id="node-tools-selector-title">
            Node Tools
          </Typography>
          <Tooltip title="Close">
            <IconButton
              aria-label="close"
              onClick={handleClose}
              className="close-button"
            >
              <Close />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent sx={{ background: "transparent", pt: 2 }}>
          <div className="search-toolbar">
            <SearchInput
              focusSearchInput={isMenuOpen}
              focusOnTyping={false}
              placeholder="Search nodes..."
              debounceTime={150}
              width={300}
              maxWidth="100%"
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              onPressEscape={handleClose}
              searchResults={availableNodes}
            />
          </div>
          <div className="selector-grid">
            <div className="left-pane selector-content">
              <div className="nodes-container">
                {isLoading ? (
                  <div className="loading-container">
                    <CircularProgress size={24} />
                  </div>
                ) : availableNodes.length === 0 && selectedCount === 0 ? (
                  <div className="no-nodes-message">
                    <Typography>
                      {(() => {
                        const hasNamespaceSelected = selectedPath.length > 0;
                        const searchLength = searchTerm.trim().length;

                        if (hasNamespaceSelected && searchLength === 0) {
                          return "No nodes available in selected namespace.";
                        } else if (hasNamespaceSelected && searchLength > 0) {
                          return "No nodes match your search in selected namespace.";
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
            </div>
            <div className="right-pane">
              {hoveredNode && (
                <NodeInfo
                  nodeMetadata={hoveredNode}
                  showConnections={false}
                  menuWidth={340}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default memo(NodeToolsSelector, isEqual);
