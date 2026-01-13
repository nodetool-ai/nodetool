/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  IconButton
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import DeleteIcon from "@mui/icons-material/Delete";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import useNodeBookmarkStore from "../../stores/NodeBookmarkStore";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";

const styles = (theme: Theme) =>
  css({
    "&.bookmark-panel-container": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "280px",
      maxHeight: "400px",
      zIndex: 20000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      animation: "fadeIn 0.15s ease-out forwards",
      overflow: "hidden"
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0, transform: "translateY(-10px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    },
    "& .bookmark-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .header-left": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    "& .header-title": {
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .bookmark-count": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.selected,
      padding: "2px 8px",
      borderRadius: "10px"
    },
    "& .bookmarks-list": {
      flex: 1,
      overflowY: "auto",
      padding: 0,
      margin: 0
    },
    "& .bookmark-item": {
      padding: 0,
      margin: 0
    },
    "& .bookmark-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 16px",
      minHeight: "48px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .bookmark-info": {
      flex: 1,
      overflow: "hidden"
    },
    "& .bookmark-name": {
      fontSize: "14px",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .bookmark-type": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .delete-button": {
      opacity: 0.5,
      "&:hover": {
        opacity: 1,
        color: theme.vars.palette.error.main
      }
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: "32px",
      marginBottom: "8px",
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "13px"
    },
    "& .shortcut-hint": {
      fontSize: "11px",
      color: theme.vars.palette.text.disabled,
      marginTop: "4px"
    }
  });

interface NodeBookmarkPanelProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
}

const NodeBookmarkPanel: React.FC<NodeBookmarkPanelProps> = memo(
  ({ workflowId, isOpen, onClose }) => {
    const theme = useTheme();
    const panelRef = useRef<HTMLDivElement>(null);
    const bookmarks = useNodeBookmarkStore((state) =>
      state.getBookmarks(workflowId)
    );
    const removeBookmark = useNodeBookmarkStore(
      (state) => state.removeBookmark
    );
    const clearBookmarks = useNodeBookmarkStore(
      (state) => state.clearBookmarks
    );
    const nodes = useNodes((state) => state.nodes);
    const setSelectedNodes = useNodes((state) => state.setSelectedNodes);
    const { setCenter } = useReactFlow();
    const getMetadata = useMetadataStore((state) => state.getMetadata);

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      };

      const handleClickOutside = (event: MouseEvent) => {
        if (
          panelRef.current &&
          !panelRef.current.contains(event.target as Node)
        ) {
          onClose();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen, onClose]);

    const handleNavigateToNode = useCallback(
      (nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          setSelectedNodes([node]);
          setCenter(
            node.position.x + (node.measured?.width ?? 150) / 2,
            node.position.y + (node.measured?.height ?? 100) / 2,
            { zoom: 1, duration: 300 }
          );
          onClose();
        }
      },
      [nodes, setSelectedNodes, setCenter, onClose]
    );

    const handleRemoveBookmark = useCallback(
      (event: React.MouseEvent, nodeId: string) => {
        event.stopPropagation();
        removeBookmark(workflowId, nodeId);
      },
      [workflowId, removeBookmark]
    );

    const handleClearAll = useCallback(() => {
      clearBookmarks(workflowId);
    }, [workflowId, clearBookmarks]);

    const getNodeDisplayName = useCallback(
      (nodeId: string): string => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
          return "Unknown Node";
        }

        if (node.data.title) {
          return node.data.title;
        }

        const metadata = getMetadata(node.type ?? "");
        return metadata?.title || node.type?.split(".").pop() || "Node";
      },
      [nodes, getMetadata]
    );

    const getNodeType = useCallback(
      (nodeId: string): string => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || !node.type) {
          return "";
        }
        const parts = node.type.split(".");
        return parts.slice(0, -1).join(".");
      },
      [nodes]
    );

    if (!isOpen) {
      return null;
    }

    const validBookmarks = bookmarks.filter((b) =>
      nodes.some((n) => n.id === b.nodeId)
    );

    return (
      <Box
        ref={panelRef}
        className="bookmark-panel-container"
        css={styles(theme)}
      >
        <Box className="bookmark-header">
          <Box className="header-left">
            <BookmarkIcon
              sx={{ fontSize: 18, color: theme.vars.palette.warning.main }}
            />
            <Typography className="header-title">Bookmarks</Typography>
            {validBookmarks.length > 0 && (
              <Typography className="bookmark-count">
                {validBookmarks.length}
              </Typography>
            )}
          </Box>
          {validBookmarks.length > 0 && (
            <IconButton
              size="small"
              onClick={handleClearAll}
              title="Clear all bookmarks"
              sx={{ color: theme.vars.palette.text.secondary }}
            >
              <ClearAllIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        {validBookmarks.length > 0 ? (
          <List className="bookmarks-list">
            {validBookmarks.map((bookmark) => (
              <ListItem
                key={bookmark.nodeId}
                className="bookmark-item"
                disablePadding
              >
                <ListItemButton
                  className="bookmark-button"
                  onClick={() => handleNavigateToNode(bookmark.nodeId)}
                >
                  <Box className="bookmark-info">
                    <Typography className="bookmark-name">
                      {bookmark.label || getNodeDisplayName(bookmark.nodeId)}
                    </Typography>
                    <Typography className="bookmark-type">
                      {getNodeType(bookmark.nodeId)}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    className="delete-button"
                    onClick={(e) => handleRemoveBookmark(e, bookmark.nodeId)}
                    title="Remove bookmark"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ) : (
          <Box className="empty-state">
            <BookmarkIcon className="empty-icon" />
            <Typography className="empty-text">No bookmarked nodes</Typography>
            <Typography className="shortcut-hint">
              Select a node and press Ctrl+M to bookmark
            </Typography>
          </Box>
        )}
      </Box>
    );
  }
);

NodeBookmarkPanel.displayName = "NodeBookmarkPanel";

export default NodeBookmarkPanel;
