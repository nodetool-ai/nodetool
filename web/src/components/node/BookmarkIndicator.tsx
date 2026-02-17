/**
 * BookmarkIndicator Component
 *
 * Displays a visual bookmark icon on nodes that have been bookmarked.
 * Shown in the top-right corner of bookmarked nodes.
 */

import { memo, useCallback, useMemo } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Bookmark as BookmarkIcon } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useNodeBookmarksStore } from "../../stores/NodeBookmarksStore";
import { useNodes } from "../../contexts/NodeContext";

interface BookmarkIndicatorProps {
  nodeId: string;
}

/**
 * BookmarkIndicator displays a bookmark icon for bookmarked nodes.
 *
 * @example
 * ```tsx
 * <BookmarkIndicator nodeId={node.id} />
 * ```
 */
export const BookmarkIndicator: React.FC<BookmarkIndicatorProps> = memo(({ nodeId }) => {
  const theme = useTheme();
  const workflowId = useNodes((state) => state.nodes.find(n => n.id === nodeId)?.data?.workflow_id);
  const isBookmarked = useNodeBookmarksStore((state) =>
    workflowId ? state.isBookmarked(workflowId, nodeId) : false
  );
  const removeBookmark = useNodeBookmarksStore((state) => state.removeBookmark);

  const handleRemoveBookmark = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (workflowId) {
      removeBookmark(workflowId, nodeId);
    }
  }, [nodeId, workflowId, removeBookmark]);

  const indicatorStyles = useMemo(() => ({
    position: "absolute" as const,
    top: -8,
    right: -8,
    zIndex: 100,
    backgroundColor: theme.vars.palette.primary.main,
    borderRadius: "50%",
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0 2px 8px ${theme.vars.palette.shadow}`,
    transition: "all 0.2s ease",
    "&:hover": {
      transform: "scale(1.1)",
      boxShadow: `0 4px 12px ${theme.vars.palette.shadow}`
    }
  }), [theme]);

  if (!isBookmarked || !workflowId) {
    return null;
  }

  return (
    <Box sx={indicatorStyles}>
      <Tooltip title="Bookmarked - Click to remove" arrow>
        <IconButton
          size="small"
          onClick={handleRemoveBookmark}
          sx={{
            padding: 0,
            color: theme.vars.palette.primary.contrastText,
            "&:hover": {
              backgroundColor: "transparent"
            }
          }}
        >
          <BookmarkIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
});

BookmarkIndicator.displayName = "BookmarkIndicator";

export default BookmarkIndicator;
