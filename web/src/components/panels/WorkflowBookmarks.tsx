/**
 * WorkflowBookmarks Panel
 *
 * Displays workflow bookmarks allowing users to quickly navigate to
 * important nodes. Bookmarks are numbered 0-9 for quick keyboard access.
 *
 * Features:
 * - List of all bookmarks with labels
 * - Click to navigate to bookmarked node
 * - Remove bookmark button
 * - Edit bookmark label
 * - Empty state with instructions
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  IconButton,
  TextField,
  Chip,
  Stack,
  Tooltip,
  Alert
} from "@mui/material";
import {
  BookmarkBorder as BookmarkBorderIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowBookmarks } from "../../hooks/useWorkflowBookmarks";
import { useNodes } from "../../contexts/NodeContext";
import type { WorkflowBookmark } from "../../stores/WorkflowBookmarksStore";
import { getShortcutTooltip } from "../../config/shortcuts";
import type { Node } from "@xyflow/react";

/**
 * Props for the WorkflowBookmarks component
 */
export interface WorkflowBookmarksProps {
  /** The current workflow ID */
  workflowId: string | undefined;
}

/**
 * Single bookmark item component
 */
interface BookmarkItemProps {
  bookmark: WorkflowBookmark;
  nodeName: string | undefined;
  onNavigate: () => void;
  onRemove: () => void;
  onUpdateLabel: (_label: string) => void;
  isEditing: boolean;
  onEditToggle: () => void;
  editingLabel: string;
  onEditingLabelChange: (label: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

const BookmarkItem: React.FC<BookmarkItemProps> = React.memo(function BookmarkItem({
  bookmark,
  nodeName,
  onNavigate,
  onRemove,
  onUpdateLabel: _onUpdateLabel,
  isEditing,
  onEditToggle,
  editingLabel,
  onEditingLabelChange,
  onSaveEdit,
  onCancelEdit
}) {
  const theme = useTheme();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        onSaveEdit();
      } else if (e.key === "Escape") {
        onCancelEdit();
      }
    },
    [onSaveEdit, onCancelEdit]
  );

  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Stack direction="row" spacing={0.5}>
          {isEditing ? (
            <>
              <IconButton
                size="small"
                onClick={onSaveEdit}
                aria-label="Save bookmark label"
              >
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={onCancelEdit}
                aria-label="Cancel edit"
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </>
          ) : (
            <>
              <Tooltip title="Edit bookmark">
                <IconButton
                  size="small"
                  onClick={onEditToggle}
                  aria-label="Edit bookmark"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove bookmark">
                <IconButton
                  size="small"
                  onClick={onRemove}
                  aria-label="Remove bookmark"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      }
      sx={{
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <ListItemButton
        onClick={onNavigate}
        disabled={isEditing}
        dense
        sx={{
          py: 1,
          pr: isEditing ? 12 : 8
        }}
      >
        <Chip
          label={bookmark.index}
          size="small"
          sx={{
            mr: 1.5,
            minWidth: 28,
            height: 24,
            bgcolor: theme.vars.palette.primary.main,
            color: theme.vars.palette.primary.contrastText,
            fontWeight: "bold",
            fontSize: "0.75rem"
          }}
        />
        <Box
          sx={{
            flex: 1,
            minWidth: 0
          }}
        >
          {isEditing ? (
            <TextField
              size="small"
              value={editingLabel}
              onChange={(e) => onEditingLabelChange(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              fullWidth
              sx={{
                "& .MuiInputBase-input": {
                  fontSize: "0.875rem",
                  py: 0.5
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {bookmark.label}
              </Typography>
              {nodeName && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    opacity: 0.7
                  }}
                >
                  {nodeName}
                </Typography>
              )}
            </>
          )}
        </Box>
      </ListItemButton>
    </ListItem>
  );
});

/**
 * WorkflowBookmarks panel component
 */
export const WorkflowBookmarks: React.FC<WorkflowBookmarksProps> = React.memo(
  function WorkflowBookmarks({ workflowId }) {
    const theme = useTheme();
    const nodes = useNodes((state: unknown) => (state as { nodes: Node[] }).nodes);
    
    const {
      bookmarks,
      removeBookmark,
      updateBookmarkLabel,
      navigateToBookmark
    } = useWorkflowBookmarks({
      workflowId
    });

    // Editing state
    const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(
      null
    );
    const [editingLabel, setEditingLabel] = useState("");

    // Get node name for bookmark
    const getNodeName = useCallback(
      (nodeId: string): string | undefined => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
          return undefined;
        }
        // Try to get a meaningful name
        const nodeData = node.data as unknown;
        if (
          nodeData &&
          typeof nodeData === "object" &&
          "label" in nodeData
        ) {
          return (nodeData.label as string) || undefined;
        }
        if (
          nodeData &&
          typeof nodeData === "object" &&
          "title" in nodeData
        ) {
          return (nodeData.title as string) || undefined;
        }
        return node.type?.split(".").pop();
      },
      [nodes]
    );

    const handleNavigateToBookmark = useCallback(
      (index: number) => {
        navigateToBookmark(index);
      },
      [navigateToBookmark]
    );

    const handleRemoveBookmark = useCallback(
      (nodeId: string) => {
        removeBookmark(nodeId);
      },
      [removeBookmark]
    );

    const handleEditToggle = useCallback((bookmark: WorkflowBookmark) => {
      setEditingBookmarkId(bookmark.nodeId);
      setEditingLabel(bookmark.label);
    }, []);

    const handleSaveEdit = useCallback(() => {
      if (editingBookmarkId) {
        updateBookmarkLabel(editingBookmarkId, editingLabel);
        setEditingBookmarkId(null);
      }
    }, [editingBookmarkId, editingLabel, updateBookmarkLabel]);

    const handleCancelEdit = useCallback(() => {
      setEditingBookmarkId(null);
      setEditingLabel("");
    }, []);

    const handleEditingLabelChange = useCallback((value: string) => {
      setEditingLabel(value);
    }, []);

    // Create bookmark items
    const bookmarkItems = useMemo(() => {
      return bookmarks.map((bookmark: WorkflowBookmark) => {
        const nodeName = getNodeName(bookmark.nodeId);
        const isEditing = editingBookmarkId === bookmark.nodeId;

        return (
          <BookmarkItem
            key={bookmark.nodeId}
            bookmark={bookmark}
            nodeName={nodeName}
            onNavigate={() => handleNavigateToBookmark(bookmark.index)}
            onRemove={() => handleRemoveBookmark(bookmark.nodeId)}
            onUpdateLabel={(label) => updateBookmarkLabel(bookmark.nodeId, label)}
            isEditing={isEditing}
            onEditToggle={() => handleEditToggle(bookmark)}
            editingLabel={editingLabel}
            onEditingLabelChange={handleEditingLabelChange}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
          />
        );
      });
    }, [
      bookmarks,
      getNodeName,
      editingBookmarkId,
      editingLabel,
      handleNavigateToBookmark,
      handleRemoveBookmark,
      updateBookmarkLabel,
      handleEditToggle,
      handleEditingLabelChange,
      handleSaveEdit,
      handleCancelEdit
    ]);

    // Empty state
    if (bookmarks.length === 0) {
      return (
        <Box
          sx={{
            p: 2,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center"
          }}
        >
          <BookmarkBorderIcon
            sx={{
              fontSize: 48,
              color: "text.disabled",
              mb: 2
            }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No bookmarks yet
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Right-click a node and select &quot;Add Bookmark&quot; to save important
            nodes
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Alert severity="info" sx={{ fontSize: "0.75rem" }}>
              Use keyboard shortcuts 0-9 to quickly navigate to bookmarks
            </Alert>
          </Box>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 1.5,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            bgcolor: theme.vars.palette.background.default
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Workflow Bookmarks
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Press {getShortcutTooltip("navigateBookmark0", "both", "combo")} to{" "}
            {getShortcutTooltip("navigateBookmark9", "both", "combo")} to
            navigate
          </Typography>
        </Box>

        {/* Bookmarks list */}
        <List
          disablePadding
          sx={{
            flex: 1,
            overflow: "auto",
            bgcolor: theme.vars.palette.background.paper
          }}
        >
          {bookmarkItems}
        </List>
      </Box>
    );
  }
);
