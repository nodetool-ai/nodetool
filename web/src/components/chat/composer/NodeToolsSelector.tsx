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
  Modal
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
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const toolsSelectorStyles = (theme: any) =>
  css({
    "&": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex",
      flexDirection: "column",
      height: "auto",
      maxHeight: "min(60vh, 400px)",
      minHeight: "250px",
      overflow: "hidden",
      border: `1px solid ${theme.palette.grey[500]}`,
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
      backgroundColor: theme.palette.grey[800],
      minWidth: "600px",
      maxWidth: "800px",
      outline: "none"
    },
    ".modal-header": {
      borderRadius: "12px 12px 0 0",
      backgroundColor: theme.palette.grey[600],
      width: "100%",
      minHeight: "40px",
      userSelect: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 1em",
      h4: {
        margin: "0",
        fontSize: theme.fontSizeNormal,
        fontWeight: 500,
        color: theme.palette.grey[100]
      }
    },
    ".modal-header:hover": {
      opacity: 0.95
    },
    ".close-button": {
      color: theme.palette.grey[200],
      width: "28px",
      height: "28px",
      padding: "2px",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.04)",
        color: theme.palette.grey[100]
      }
    },
    ".tools-content": {
      borderRadius: "0 0 8px 8px",
      padding: ".5em 0px 1em .5em",
      width: "100%",
      maxHeight: "77vh",
      flexGrow: 1,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      display: "flex",
      flexDirection: "column"
    },
    ".search-toolbar": {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: "0.5em",
      minHeight: "40px",
      flexGrow: 0,
      overflow: "hidden",
      width: "100%",
      margin: 0,
      padding: ".5em 1em 0 .7em",
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
      borderBottom: `1px solid ${theme.palette.grey[500]}`,
      backgroundColor: theme.palette.grey[600],
      ".selected-count": {
        backgroundColor: "var(--palette-primary-main)",
        color: theme.palette.grey[1000],
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
      color: theme.palette.grey[200],
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
  const selectedNodeTypes = useMemo(() => value || [], [value]);
  const theme = useTheme();
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

  const availableNodes = useMemo(() => {
    // Show nodes if either:
    // 1. A namespace is selected (selectedPath has items), OR
    // 2. Search term has at least 2 characters
    const hasNamespaceSelected = selectedPath.length > 0;
    const hasMinSearchChars = searchTerm.trim().length >= 2;

    if (!hasNamespaceSelected && !hasMinSearchChars) {
      return [];
    }

    // Filter out nodes with default namespace and return sorted results
    return searchResults.filter(
      (node: NodeMetadata) => node.namespace !== "default"
    );
  }, [searchResults, searchTerm, selectedPath]);

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
                  backgroundColor: "var(--palette-primary-main)",
                  color: "var(--palette-grey-1000)",
                  "& .MuiChip-label": {
                    padding: "0 4px"
                  }
                }}
              />
            )
          }
          sx={(theme) => ({
            color: theme.palette.grey[0],
            padding: "0.25em 0.75em",
            "&:hover": {
              backgroundColor: theme.palette.grey[500]
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

      <Modal
        open={isMenuOpen}
        onClose={handleClose}
        aria-labelledby="node-tools-selector-title"
      >
        <Box css={memoizedStyles} className="node-tools-selector-menu">
          <div className="modal-header">
            <Typography variant="h4" id="node-tools-selector-title">
              Node Tools Selector
            </Typography>
            <IconButton
              className="close-button"
              size="small"
              onClick={handleClose}
              aria-label="close"
            >
              <Close />
            </IconButton>
          </div>

          <div className="tools-content">
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

            {selectedCount > 0 && (
              <div className="selection-info">
                <Typography
                  variant="body2"
                  sx={{ color: "var(--palette-grey-0)" }}
                >
                  Selected:
                </Typography>
                <Chip
                  size="small"
                  label={selectedCount}
                  className="selected-count"
                />
                <Typography
                  variant="body2"
                  sx={{ color: "var(--palette-grey-200)" }}
                >
                  {selectedCount === 1 ? "node" : "nodes"}
                </Typography>
              </div>
            )}

            <div className="nodes-container">
              {isLoading ? (
                <div className="loading-container">
                  <CircularProgress size={24} />
                </div>
              ) : availableNodes.length === 0 ? (
                <div className="no-nodes-message">
                  <Typography>
                    {(() => {
                      const hasNamespaceSelected = selectedPath.length > 0;
                      const searchLength = searchTerm.trim().length;

                      if (hasNamespaceSelected && searchLength === 0) {
                        return "No nodes available in selected namespace.";
                      } else if (hasNamespaceSelected && searchLength > 0) {
                        return "No nodes match your search in selected namespace.";
                      } else if (searchLength === 0) {
                        return "Type at least 2 characters to search for nodes...";
                      } else if (searchLength === 1) {
                        return "Type at least one more character to search...";
                      } else {
                        return "No nodes match your search.";
                      }
                    })()}
                  </Typography>
                </div>
              ) : (
                <RenderNodesSelectable
                  nodes={availableNodes}
                  showCheckboxes={true}
                  selectedNodeTypes={selectedNodeTypes}
                  onToggleSelection={handleToggleNode}
                />
              )}
            </div>
          </div>
        </Box>
      </Modal>
    </>
  );
};

export default memo(NodeToolsSelector, isEqual);
