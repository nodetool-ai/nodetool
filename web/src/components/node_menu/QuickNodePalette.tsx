/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useRef, useMemo } from "react";
import { Dialog, Box, InputBase, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import useQuickNodePaletteStore from "../../stores/QuickNodePaletteStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { FixedSizeList as VirtualList, ListChildComponentProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { isMac } from "../../utils/platform";

const NODE_ITEM_HEIGHT = 52;

const paletteStyles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      maxWidth: "600px",
      width: "90vw",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      overflow: "hidden"
    },
    ".palette-container": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      maxHeight: "70vh"
    },
    ".search-container": {
      display: "flex",
      alignItems: "center",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    ".search-icon": {
      color: theme.vars.palette.text.secondary,
      marginRight: "12px"
    },
    ".search-input": {
      flex: 1,
      fontSize: "1rem",
      color: theme.vars.palette.text.primary,
      "&::placeholder": {
        color: theme.vars.palette.text.disabled
      }
    },
    ".keyboard-hint": {
      display: "flex",
      gap: "8px",
      marginLeft: "12px"
    },
    ".key-hint": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "0.75rem",
      color: theme.vars.palette.text.disabled,
      "& kbd": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "4px",
        padding: "2px 6px",
        fontFamily: "monospace",
        fontSize: "0.7rem"
      }
    },
    ".results-container": {
      flex: 1,
      overflow: "hidden"
    },
    ".results-list": {
      padding: 0,
      margin: 0
    },
    ".node-item": {
      display: "flex",
      alignItems: "center",
      padding: "8px 16px",
      minHeight: `${NODE_ITEM_HEIGHT}px`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".node-item.selected": {
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
      borderLeft: `3px solid var(--palette-primary-main)`
    },
    ".node-icon": {
      width: "32px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginRight: "12px",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.disabledBackground,
      color: theme.vars.palette.text.secondary
    },
    ".node-info": {
      flex: 1,
      minWidth: 0
    },
    ".node-title": {
      fontSize: "0.9rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".node-namespace": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".no-results": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px",
      color: theme.vars.palette.text.secondary,
      "& .MuiTypography-root": {
        marginTop: "8px"
      }
    },
    ".recent-searches": {
      padding: "12px 16px",
      backgroundColor: theme.vars.palette.action.hover,
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".recent-title": {
      fontSize: "0.75rem",
      fontWeight: 600,
      color: theme.vars.palette.text.disabled,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      marginBottom: "8px"
    },
    ".recent-tags": {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px"
    },
    ".recent-tag": {
      fontSize: "0.8rem",
      padding: "4px 10px",
      borderRadius: "16px",
      backgroundColor: theme.vars.palette.action.disabledBackground,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.primary
      }
    },
    ".result-count": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.disabled,
      padding: "0 16px 8px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    }
  });

interface QuickNodePaletteProps {
  active: boolean;
}

const QuickNodePalette: React.FC<QuickNodePaletteProps> = ({ active: _active }) => {
  const theme = useTheme();
  const styles = useMemo(() => paletteStyles(theme), [theme]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<VirtualList>(null);

  const {
    isOpen,
    searchTerm,
    selectedIndex,
    filteredNodes,
    recentSearches,
    closePalette,
    setSearchTerm,
    setSelectedIndex,
    moveSelectionDown,
    getSelectedNode
  } = useQuickNodePaletteStore();

  const handleCreateNode = useCreateNode({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  });

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current && filteredNodes.length > 0) {
      listRef.current.scrollToItem(selectedIndex, "smart");
    }
  }, [isOpen, selectedIndex, filteredNodes.length]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isOpen) {return;}

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveSelectionDown();
          break;
        case "Enter":
          event.preventDefault();
          {
            const selectedNode = getSelectedNode();
            if (selectedNode) {
              handleCreateNode(selectedNode);
              closePalette();
            }
          }
          break;
        case "Escape":
          event.preventDefault();
          closePalette();
          break;
      }
    },
    [isOpen, moveSelectionDown, getSelectedNode, handleCreateNode, closePalette]
  );

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (event.target === event.currentTarget) {
        closePalette();
      }
    },
    [closePalette]
  );

  const handleRecentSearchClick = useCallback(
    (term: string) => {
      setSearchTerm(term);
    },
    [setSearchTerm]
  );

  const renderNodeItem = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const node = filteredNodes[index];
      const isSelected = index === selectedIndex;

      return (
        <div style={style}>
          <div
            className={`node-item ${isSelected ? "selected" : ""}`}
            onClick={() => {
              setSelectedIndex(index);
              handleCreateNode(node);
              closePalette();
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="node-icon">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {node.title.charAt(0).toUpperCase()}
              </Typography>
            </div>
            <div className="node-info">
              <Typography className="node-title">{node.title}</Typography>
              <Typography className="node-namespace">{node.namespace}</Typography>
            </div>
          </div>
        </div>
      );
    },
    [filteredNodes, selectedIndex, handleCreateNode, closePalette, setSelectedIndex]
  );

  const keyboardHint = isMac() ? "⌘P" : "Ctrl+P";
  const arrowUpHint = isMac() ? "↑" : "↑";
  const arrowDownHint = isMac() ? "↓" : "↓";
  const enterHint = isMac() ? "↵" : "Enter";

  if (!isOpen) {
    return null;
  }

  const hasSearchTerm = searchTerm.trim().length > 0;

  return (
    <Dialog
      open={isOpen}
      onClose={closePalette}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      css={styles}
      className="quick-node-palette-dialog"
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(2px)"
        }
      }}
    >
      <Box className="palette-container">
        <Box className="search-container">
          <SearchIcon className="search-icon" />
          <InputBase
            ref={searchInputRef}
            className="search-input"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            inputProps={{
              "aria-label": "Search nodes"
            }}
          />
          <Box className="keyboard-hint">
            <Box className="key-hint">
              <kbd>{arrowUpHint}</kbd>
              <kbd>{arrowDownHint}</kbd>
              <span>Navigate</span>
            </Box>
            <Box className="key-hint">
              <kbd>{enterHint}</kbd>
              <span>Select</span>
            </Box>
            <Box className="key-hint">
              <kbd>Esc</kbd>
              <span>Close</span>
            </Box>
          </Box>
        </Box>

        {hasSearchTerm ? (
          <>
            <Typography className="result-count">
              {filteredNodes.length} node{filteredNodes.length !== 1 ? "s" : ""} found
            </Typography>
            <Box className="results-container">
              {filteredNodes.length > 0 ? (
                <AutoSizer>
                  {({ height, width }) => (
                    <VirtualList
                      ref={listRef}
                      height={Math.max(height || 0, 100)}
                      width={Math.max(width || 0, 280)}
                      itemCount={filteredNodes.length}
                      itemSize={NODE_ITEM_HEIGHT}
                      className="results-list"
                      style={{ overflowX: "hidden" }}
                    >
                      {renderNodeItem}
                    </VirtualList>
                  )}
                </AutoSizer>
              ) : (
                <Box className="no-results">
                  <SearchIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Typography>No nodes found for &quot;{searchTerm}&quot;</Typography>
                </Box>
              )}
            </Box>
          </>
        ) : (
          <>
            {recentSearches.length > 0 && (
              <Box className="recent-searches">
                <Typography className="recent-title">Recent Searches</Typography>
                <Box className="recent-tags">
                  {recentSearches.map((term, index) => (
                    <Box
                      key={index}
                      className="recent-tag"
                      onClick={() => handleRecentSearchClick(term)}
                    >
                      {term}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
            <Box className="no-results">
              <SearchIcon sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography>Type to search for nodes</Typography>
              <Typography variant="body2" sx={{ marginTop: "8px", opacity: 0.7 }}>
                Press {keyboardHint} anytime to open this palette
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
};

export default memo(QuickNodePalette);
