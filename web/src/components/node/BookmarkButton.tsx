/**
 * BookmarkButton
 *
 * A button component that allows users to bookmark/unbookmark nodes.
 * Can be added to node headers or toolbars for quick access.
 */

import React, { memo, useCallback, useMemo } from "react";
import { IconButton, Tooltip, SxProps, Theme } from "@mui/material";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import { useNodeBookmarksStore } from "../../stores/NodeBookmarksStore";

interface BookmarkButtonProps {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  size?: "small" | "medium" | "large";
  sx?: SxProps<Theme>;
  onBookmarkChange?: (isBookmarked: boolean) => void;
}

const BookmarkButton: React.FC<BookmarkButtonProps> = memo(({
  nodeId,
  nodeName,
  nodeType,
  size = "small",
  sx,
  onBookmarkChange
}) => {
  const isBookmarked = useNodeBookmarksStore((state) => state.isBookmarked(nodeId));
  const toggleBookmark = useNodeBookmarksStore((state) => state.toggleBookmark);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    toggleBookmark(nodeId, nodeName, nodeType);
    onBookmarkChange?.(!isBookmarked);
  }, [nodeId, nodeName, nodeType, isBookmarked, toggleBookmark, onBookmarkChange]);

  const buttonSx = useMemo(() => ({
    color: isBookmarked ? "warning.main" : "text.secondary",
    transition: "all 0.2s ease",
    "&:hover": {
      color: isBookmarked ? "warning.dark" : "text.primary",
      transform: "scale(1.1)"
    },
    ...sx
  }), [isBookmarked, sx]);

  return (
    <Tooltip
      title={isBookmarked ? "Remove bookmark" : "Bookmark this node"}
      placement="top"
      arrow
    >
      <IconButton
        size={size}
        onClick={handleClick}
        sx={buttonSx}
        aria-label={isBookmarked ? "Remove bookmark" : "Bookmark node"}
      >
        {isBookmarked ? (
          <BookmarkIcon fontSize="inherit" />
        ) : (
          <BookmarkBorderIcon fontSize="inherit" />
        )}
      </IconButton>
    </Tooltip>
  );
});

BookmarkButton.displayName = "BookmarkButton";

export default BookmarkButton;
