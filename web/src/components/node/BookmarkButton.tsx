/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Menu, MenuItem, ListItemText } from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme, isBookmarked: boolean) =>
  css({
    transition: "all 0.2s ease-in-out",
    color: isBookmarked
      ? theme.vars.palette.primary.main
      : theme.vars.palette.text.secondary,
    "&:hover": {
      transform: "scale(1.1)",
      color: isBookmarked
        ? theme.vars.palette.primary.light
        : theme.vars.palette.text.primary
    }
  });

export interface BookmarkButtonProps {
  /** Whether the current node is bookmarked */
  isBookmarked: boolean;
  /** The bookmark index (1-9) if bookmarked, undefined otherwise */
  bookmarkIndex?: number;
  /** Callback to set a bookmark at a specific index */
  onSetBookmark: (index: number) => void;
  /** Callback to remove the bookmark */
  onRemoveBookmark: () => void;
  /** Button size */
  buttonSize?: "small" | "medium" | "large";
  /** Tooltip text when not bookmarked */
  addTooltip?: string;
  /** Tooltip text when bookmarked */
  removeTooltip?: string;
  /** Whether to stop event propagation */
  stopPropagation?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

export const BookmarkButton: React.FC<BookmarkButtonProps> = memo(({
  isBookmarked,
  bookmarkIndex,
  onSetBookmark,
  onRemoveBookmark,
  buttonSize = "small",
  addTooltip = "Add bookmark (Ctrl+Shift+1-9)",
  removeTooltip = "Remove bookmark",
  stopPropagation = true,
  disabled = false,
  className
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  const memoizedStyles = useMemo(
    () => styles(theme, isBookmarked),
    [theme, isBookmarked]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        e.stopPropagation();
      }

      if (isBookmarked) {
        onRemoveBookmark();
      } else {
        // Open menu to select bookmark slot
        setAnchorEl(e.currentTarget);
      }
    },
    [isBookmarked, onRemoveBookmark, stopPropagation]
  );

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleSelectSlot = useCallback(
    (index: number) => {
      onSetBookmark(index);
      setAnchorEl(null);
    },
    [onSetBookmark]
  );

  const getTooltipText = useCallback(() => {
    if (isBookmarked && bookmarkIndex !== undefined) {
      return `${removeTooltip} (${bookmarkIndex})`;
    }
    return addTooltip;
  }, [isBookmarked, bookmarkIndex, addTooltip, removeTooltip]);

  return (
    <>
      <Tooltip
        title={getTooltipText()}
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <span>
          <IconButton
            className={`nodrag bookmark-button ${className || ""}`}
            css={memoizedStyles}
            onClick={handleClick}
            disabled={disabled}
            size={buttonSize}
            aria-label={getTooltipText()}
            aria-pressed={isBookmarked}
          >
            {isBookmarked ? (
              <BookmarkIcon fontSize={buttonSize} />
            ) : (
              <BookmarkBorderIcon fontSize={buttonSize} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {/* Bookmark slot selection menu */}
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleCloseMenu}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px",
              minWidth: 180
            }
          }
        }}
      >
        <MenuItem disabled sx={{ opacity: 1 }}>
          <ListItemText
            primary="Select bookmark slot"
            primaryTypographyProps={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "text.secondary"
            }}
          />
        </MenuItem>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
          <MenuItem
            key={index}
            onClick={() => handleSelectSlot(index)}
            sx={{
              py: 0.75,
              minHeight: "unset"
            }}
          >
            <ListItemText
              primary={`Slot ${index}`}
              secondaryTypographyProps={{
                fontSize: "0.75rem",
                fontFamily: "monospace"
              }}
            />
            <span
              style={{
                fontSize: "0.7rem",
                color: "text.secondary",
                fontFamily: "monospace",
                marginLeft: "auto"
              }}
            >
              Ctrl+Shift+{index}
            </span>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
});

BookmarkButton.displayName = "BookmarkButton";

export default memo(BookmarkButton);
