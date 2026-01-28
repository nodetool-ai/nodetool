/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme, isFavorite: boolean, variant: string) =>
  css({
    transition: "all 0.2s ease-in-out",
    color: isFavorite
      ? variant === "star"
        ? theme.vars.palette.warning.main
        : variant === "heart"
        ? theme.vars.palette.error.main
        : theme.vars.palette.primary.main
      : theme.vars.palette.text.secondary,
    "&:hover": {
      transform: "scale(1.1)",
      color: isFavorite
        ? variant === "star"
          ? theme.vars.palette.warning.light
          : variant === "heart"
          ? theme.vars.palette.error.light
          : theme.vars.palette.primary.light
        : theme.vars.palette.text.primary
    }
  });

export interface FavoriteButtonProps {
  /** Whether the item is favorited */
  isFavorite: boolean;
  /** Callback when favorite state changes */
  onToggle: (isFavorite: boolean) => void;
  /** Icon variant */
  variant?: "star" | "heart" | "bookmark";
  /** Button size */
  buttonSize?: "small" | "medium" | "large";
  /** Tooltip text when not favorited */
  addTooltip?: string;
  /** Tooltip text when favorited */
  removeTooltip?: string;
  /** Whether to stop event propagation */
  stopPropagation?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  isFavorite,
  onToggle,
  variant = "star",
  buttonSize = "small",
  addTooltip = "Add to favorites",
  removeTooltip = "Remove from favorites",
  stopPropagation = true,
  disabled = false,
  className
}) => {
  const theme = useTheme();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (stopPropagation) {
        e.stopPropagation();
      }
      onToggle(!isFavorite);
    },
    [isFavorite, onToggle, stopPropagation]
  );

  const getIcon = () => {
    switch (variant) {
      case "heart":
        return isFavorite ? <FavoriteIcon fontSize={buttonSize} /> : <FavoriteBorderIcon fontSize={buttonSize} />;
      case "bookmark":
        return isFavorite ? <BookmarkIcon fontSize={buttonSize} /> : <BookmarkBorderIcon fontSize={buttonSize} />;
      case "star":
      default:
        return isFavorite ? <StarIcon fontSize={buttonSize} /> : <StarBorderIcon fontSize={buttonSize} />;
    }
  };

  return (
    <Tooltip
      title={isFavorite ? removeTooltip : addTooltip}
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <span>
        <IconButton
          className={`nodrag favorite-button ${className || ""}`}
          css={styles(theme, isFavorite, variant)}
          onClick={handleClick}
          disabled={disabled}
          size={buttonSize}
          aria-label={isFavorite ? removeTooltip : addTooltip}
          aria-pressed={isFavorite}
        >
          {getIcon()}
        </IconButton>
      </span>
    </Tooltip>
  );
};

export default FavoriteButton;
