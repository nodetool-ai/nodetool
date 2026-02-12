/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback } from "react";
import { Bookmark as BookmarkIcon, BookmarkBorder as BookmarkBorderIcon } from "@mui/icons-material";
import { Tooltip, IconButton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";

interface BookmarkIndicatorProps {
  isBookmarked: boolean;
  onToggle: () => void;
}

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "-12px",
    right: "-12px",
    zIndex: 1000,
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: "50%",
    boxShadow: theme.shadows[2],
    border: `1px solid ${theme.vars.palette.divider}`,
    transition: "all 0.2s ease",
    opacity: 0,
    "&:hover": {
      opacity: 1,
      transform: "scale(1.1)"
    },
    "&.visible": {
      opacity: 1
    },
    "& .bookmark-icon": {
      fontSize: "16px",
      color: theme.vars.palette.warning.main,
      transition: "color 0.2s ease"
    },
    "& .bookmark-border-icon": {
      fontSize: "16px",
      color: theme.vars.palette.text.secondary,
      transition: "color 0.2s ease"
    },
    "& .bookmark-button": {
      padding: "4px",
      width: "24px",
      height: "24px"
    }
  });

const BookmarkIndicator: React.FC<BookmarkIndicatorProps> = memo(({
  isBookmarked,
  onToggle
}) => {
  const theme = useTheme();

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onToggle();
  }, [onToggle]);

  return (
    <div
      css={styles(theme)}
      className={isBookmarked ? "visible" : ""}
    >
      <Tooltip
        title={
          <span>
            {isBookmarked ? "Remove Bookmark" : "Add Bookmark"}{" "}
            {getShortcutTooltip("toggleBookmark", undefined, "combo")}
          </span>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
        arrow
      >
        <IconButton
          className="bookmark-button"
          onClick={handleClick}
          size="small"
          disableRipple
        >
          {isBookmarked ? (
            <BookmarkIcon className="bookmark-icon" />
          ) : (
            <BookmarkBorderIcon className="bookmark-border-icon" />
          )}
        </IconButton>
      </Tooltip>
    </div>
  );
});

BookmarkIndicator.displayName = "BookmarkIndicator";

export default BookmarkIndicator;
