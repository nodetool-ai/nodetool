/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Dialog, Typography, InputBase } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import StarIcon from "@mui/icons-material/Star";
import HistoryIcon from "@mui/icons-material/History";
import { useQuickNodePaletteStore } from "../../stores/QuickNodePaletteStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";

const paletteStyles = (theme: Theme) =>
  css({
    "&": {
      position: "fixed",
      top: "20vh",
      left: "50%",
      transform: "translateX(-50%)",
      width: "600px",
      maxWidth: "90vw",
      zIndex: 30000,
      animation: "fadeInQuickNodePalette 0.15s ease-out forwards"
    },
    "@keyframes fadeInQuickNodePalette": {
      "0%": {
        opacity: 0,
        transform: "translateX(-50%) scale(0.95)"
      },
      "100%": {
        opacity: 1,
        transform: "translateX(-50%) scale(1)"
      }
    },
    ".MuiDialog-paper": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "16px",
      boxShadow: "0 24px 48px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0,0,0,0.1)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden"
    },
    ".palette-header": {
      display: "flex",
      alignItems: "center",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    ".search-icon": {
      color: theme.vars.palette.text.secondary,
      marginRight: "12px",
      display: "flex",
      alignItems: "center"
    },
    ".search-input": {
      flex: 1,
      fontSize: "16px",
      color: theme.vars.palette.text.primary,
      "&::placeholder": {
        color: theme.vars.palette.text.secondary,
        opacity: 0.7
      }
    },
    ".palette-content": {
      maxHeight: "400px",
      overflowY: "auto",
      padding: "8px 0"
    },
    ".palette-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
      fontSize: "12px",
      color: theme.vars.palette.text.secondary
    },
    ".result-count": {},
        ".keyboard-hints": {
          display: "flex",
          gap: "16px",
          ".hint": {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            kbd: {
              backgroundColor: theme.vars.palette.action.selected,
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
              fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
            }
          }
        }
  });

const itemStyles = (theme: Theme) =>
  css({
    ".palette-item": {
      display: "flex",
      alignItems: "center",
      padding: "10px 16px",
      cursor: "pointer",
      transition: "all 0.15s ease",
      borderLeft: "3px solid transparent",
      "&:hover, &.selected": {
        backgroundColor: theme.vars.palette.action.selected
      },
      "&.selected": {
        borderLeftColor: theme.vars.palette.primary.main
      }
    },
    ".item-icon": {
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
    ".item-content": {
      flex: 1,
      minWidth: 0
    },
    ".item-title": {
      fontSize: "14px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".item-namespace": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      marginTop: "2px"
    },
    ".item-badges": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      marginLeft: "8px",
      ".badge": {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: "18px",
        borderRadius: "4px",
        fontSize: "10px",
        "&.favorite": {
          color: "warning.main"
        },
        "&.recent": {
          color: "primary.main"
        }
      }
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      color: theme.vars.palette.text.secondary,
      ".empty-icon": {
        fontSize: "48px",
        marginBottom: "16px",
        opacity: 0.5
      },
      ".empty-text": {
        fontSize: "14px",
        textAlign: "center"
      }
    }
  });

const QuickNodePalette: React.FC = () => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => paletteStyles(theme), [theme]);
  const itemMemoizedStyles = useMemo(() => itemStyles(theme), [theme]);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen,
    searchTerm,
    results,
    selectedIndex,
    closePalette,
    setSearchTerm,
    setSelectedIndex,
    moveSelectionUp,
    moveSelectionDown,
    getSelectedItem,
    initializeNodes
  } = useQuickNodePaletteStore();

  const metadata = useMetadataStore((state) => state.metadata);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const handleCreateNode = useCreateNode({
    x: 0,
    y: 0
  });

  useEffect(() => {
    if (Object.keys(metadata).length > 0) {
      initializeNodes(metadata);
    }
  }, [metadata, initializeNodes]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) { return; }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelectionUp();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelectionDown();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = getSelectedItem();
        if (selected) {
          handleItemSelect(selected);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, moveSelectionUp, moveSelectionDown, getSelectedItem, handleItemSelect, closePalette]);

  const handleItemSelect = useCallback(
    (item: ReturnType<typeof getSelectedItem>) => {
      if (!item) { return; }

      const nodeMetadata = getMetadata(item.nodeType);
      if (!nodeMetadata) {
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${item.nodeType}`,
          timeout: 3000
        });
        return;
      }

      addRecentNode(item.nodeType);
      handleCreateNode(nodeMetadata);

      addNotification({
        type: "info",
        content: `Added ${item.title} to canvas`,
        timeout: 2000
      });

      closePalette();
    },
    [getMetadata, addRecentNode, handleCreateNode, addNotification, closePalette]
  );

  const getNodeIcon = useCallback((nodeType: string) => {
    const metadata = getMetadata(nodeType);
    if (metadata?.outputs?.[0]?.type?.type) {
      return metadata.outputs[0].type.type.charAt(0).toUpperCase();
    }
    return nodeType.split(".").pop()?.charAt(0).toUpperCase() ?? "?";
  }, [getMetadata]);

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog
      open={isOpen}
      onClose={closePalette}
      className="quick-node-palette-dialog"
      css={memoizedStyles}
      PaperProps={{
        component: "div"
      }}
    >
      <Box className="palette-header">
        <SearchIcon className="search-icon" />
        <InputBase
          ref={inputRef}
          className="search-input"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              moveSelectionUp();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              moveSelectionDown();
            }
          }}
        />
      </Box>

      <Box className="palette-content" css={itemMemoizedStyles}>
        {results.length === 0 ? (
          <Box className="empty-state">
            <Typography className="empty-text">
              {searchTerm
                ? `No nodes found for "${searchTerm}"`
                : "No nodes available"}
            </Typography>
          </Box>
        ) : (
          results.map((item, index) => (
            <Box
              key={item.nodeType}
              className={`palette-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => {
                setSelectedIndex(index);
                handleItemSelect(item);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Box className="item-icon">
                {getNodeIcon(item.nodeType)}
              </Box>
              <Box className="item-content">
                <Typography className="item-title">{item.title}</Typography>
                <Typography className="item-namespace">{item.namespace}</Typography>
              </Box>
              <Box className="item-badges">
                {item.isFavorite && (
                  <Box className="badge favorite">
                    <StarIcon sx={{ fontSize: "14px" }} />
                  </Box>
                )}
                {item.isRecent && (
                  <Box className="badge recent">
                    <HistoryIcon sx={{ fontSize: "14px" }} />
                  </Box>
                )}
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Box className="palette-footer">
        <Typography className="result-count">
          {results.length} result{results.length !== 1 ? "s" : ""}
        </Typography>
        <Box className="keyboard-hints">
          <Box className="hint">
            <kbd>↑↓</kbd> Navigate
          </Box>
          <Box className="hint">
            <kbd>Enter</kbd> Add
          </Box>
          <Box className="hint">
            <kbd>Esc</kbd> Close
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
};

export default memo(QuickNodePalette);
