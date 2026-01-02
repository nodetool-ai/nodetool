/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Button, Chip, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme, isSelected: boolean) =>
  css({
    borderRadius: "16px",
    textTransform: "none",
    fontWeight: isSelected ? 600 : 400,
    transition: "all 0.2s ease",
    backgroundColor: isSelected
      ? theme.vars.palette.primary.main
      : "transparent",
    color: isSelected
      ? theme.vars.palette.primary.contrastText
      : theme.vars.palette.text.primary,
    borderColor: isSelected
      ? theme.vars.palette.primary.main
      : theme.vars.palette.divider,
    "&:hover": {
      backgroundColor: isSelected
        ? theme.vars.palette.primary.dark
        : theme.vars.palette.action.hover,
      borderColor: isSelected
        ? theme.vars.palette.primary.dark
        : theme.vars.palette.text.secondary
    }
  });

export interface TagButtonProps {
  /** Tag label */
  label: string;
  /** Whether the tag is selected */
  selected?: boolean;
  /** Click handler */
  onClick: () => void;
  /** Optional count to display */
  count?: number;
  /** Optional tooltip */
  tooltip?: string;
  /** Use chip variant instead of button */
  variant?: "button" | "chip";
  /** Size */
  size?: "small" | "medium";
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

export const TagButton: React.FC<TagButtonProps> = ({
  label,
  selected = false,
  onClick,
  count,
  tooltip,
  variant = "button",
  size = "small",
  disabled = false,
  className
}) => {
  const theme = useTheme();

  const displayLabel = count !== undefined ? `${label} (${count})` : label;

  const content =
    variant === "chip" ? (
      <Chip
        label={displayLabel}
        onClick={onClick}
        className={`nodrag tag-button ${selected ? "selected" : ""} ${className || ""}`}
        color={selected ? "primary" : "default"}
        variant={selected ? "filled" : "outlined"}
        size={size}
        disabled={disabled}
      />
    ) : (
      <Button
        css={styles(theme, selected)}
        onClick={onClick}
        variant="outlined"
        size={size}
        disabled={disabled}
        className={`nodrag tag-button ${selected ? "selected" : ""} ${className || ""}`}
      >
        {displayLabel}
      </Button>
    );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} enterDelay={TOOLTIP_ENTER_DELAY}>
        <span>{content}</span>
      </Tooltip>
    );
  }

  return content;
};

export default TagButton;
