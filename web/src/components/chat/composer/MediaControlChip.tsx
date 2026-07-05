/** @jsxImportSource @emotion/react */
import React, {
  forwardRef,
  memo
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { BORDER_RADIUS, FlexRow, Text, MOTION } from "../../ui_primitives";

interface MediaControlChipProps {
  /** Leading icon (e.g. clock, aspect, resolution). */
  icon?: React.ReactNode;
  /**
   * Primary label displayed inside the chip. Omit for an icon-only chip
   * (rendered compact); pair with `title` to keep it accessible.
   */
  label?: React.ReactNode;
  /** Native tooltip / accessible name — used for icon-only chips. */
  title?: string;
  /** Whether the chip is currently "active" (open popover). */
  active?: boolean;
  /** Show a chevron indicator on the right. Defaults to true. */
  showChevron?: boolean;
  /** Click handler for the chip. */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Disable the chip. */
  disabled?: boolean;
  /** Size preset. */
  size?: "sm" | "md";
  /** Optional class name. */
  className?: string;
  /** Show as emphasized / primary. */
  emphasis?: "default" | "primary";
  /** Allow this chip to shrink and truncate its label. */
  truncate?: boolean;
  /** Max width in px when truncating. Defaults to 200. */
  maxWidth?: number;
}

const createStyles = (theme: Theme, size: "sm" | "md", emphasis: "default" | "primary", active: boolean, truncate: boolean, iconOnly: boolean, maxWidth: number) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: iconOnly ? 0 : size === "sm" ? 6 : 8,
    height: size === "sm" ? 30 : 34,
    padding: iconOnly
      ? size === "sm"
        ? "0 7px"
        : "0 8px"
      : size === "sm"
        ? "0 10px"
        : "0 12px",
    borderRadius: BORDER_RADIUS.pill,
    border: "1px solid transparent",
    backgroundColor: active
      ? theme.vars.palette.c_overlay_strong
      : emphasis === "primary"
        ? theme.vars.palette.c_overlay
        : "transparent",
    color: theme.vars.palette.grey[100],
    fontFamily: theme.fontFamily1,
    fontSize: size === "sm" ? "var(--fontSizeSmall)" : "var(--fontSizeNormal)",
    lineHeight: 1,
    cursor: "pointer",
    outline: "none",
    transition: `background-color ${MOTION.normal}, border-color ${MOTION.normal}, color ${MOTION.normal}`,
    whiteSpace: "nowrap",
    flexShrink: truncate ? 1 : 0,
    minWidth: truncate ? 0 : undefined,
    maxWidth: truncate ? maxWidth : undefined,
    overflow: truncate ? "hidden" : undefined,
    "&:hover:not(:disabled)": {
      backgroundColor: theme.vars.palette.c_overlay
    },
    "&:focus-visible": {
      borderColor: theme.vars.palette.primary.main
    },
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed"
    },
    ".media-chip-icon": {
      display: "inline-flex",
      alignItems: "center",
      color: theme.vars.palette.grey[300],
      "& svg": { fontSize: size === "sm" ? 16 : 18 }
    },
    ".media-chip-chevron": {
      display: "inline-flex",
      alignItems: "center",
      opacity: 0.6,
      marginLeft: 2,
      "& svg": { fontSize: 16 }
    }
  });

/**
 * Compact rounded chip used for the media-generation composer controls
 * (mode selector, model chip, resolution chip, aspect ratio, duration, etc.).
 * Matches the pill shape shown in the reference screenshots.
 */
const MediaControlChip = memo(
  forwardRef<HTMLButtonElement, MediaControlChipProps>(
    (
      {
        icon,
        label,
        title,
        active = false,
        showChevron = true,
        onClick,
        disabled = false,
        size = "md",
        className,
        emphasis = "default",
        truncate = false,
        maxWidth = 200
      },
      ref
    ) => {
      const theme = useTheme();
      const hasLabel =
        label !== undefined && label !== null && label !== "";
      return (
        <button
          ref={ref}
          type="button"
          title={title}
          aria-label={!hasLabel ? title : undefined}
          className={`media-control-chip${className ? ` ${className}` : ""}${active ? " active" : ""}`}
          css={createStyles(theme, size, emphasis, active, truncate, !hasLabel, maxWidth)}
          onClick={onClick}
          disabled={disabled}
          aria-pressed={active || undefined}
        >
          <FlexRow align="center" gap={hasLabel ? 1 : 0}>
            {icon && <span className="media-chip-icon">{icon}</span>}
            {hasLabel && (
              <Text
                component="span"
                size="small"
                weight={500}
                sx={{
                  color: "inherit",
                  lineHeight: 1.2,
                  ...(truncate && {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  })
                }}
              >
                {label}
              </Text>
            )}
            {showChevron && (
              <span className="media-chip-chevron">
                <ExpandLessIcon />
              </span>
            )}
          </FlexRow>
        </button>
      );
    }
  )
);

MediaControlChip.displayName = "MediaControlChip";

export default MediaControlChip;
