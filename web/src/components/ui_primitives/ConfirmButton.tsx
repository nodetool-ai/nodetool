/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import DoneIcon from "@mui/icons-material/Done";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export type ConfirmIconVariant = "check" | "done" | "doneAll" | "circle" | "circleOutline";

export interface ConfirmButtonProps {
  /** Click handler */
  onClick: () => void;
  /** Icon variant */
  iconVariant?: ConfirmIconVariant;
  /** Button size */
  size?: "small" | "medium" | "large";
  /** Tooltip text */
  tooltip?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Color variant */
  color?: "default" | "primary" | "success";
  /** Tooltip placement */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  /** Additional className */
  className?: string;
}

const styles = (theme: Theme) => css`
  .confirm-button {
    color: ${theme.vars.palette.text.secondary};
    transition: all 0.2s ease;
    
    &:hover {
      color: ${theme.vars.palette.success.main};
      background-color: ${theme.vars.palette.success.main}1a;
    }
    
    &.primary {
      color: ${theme.vars.palette.primary.main};
      &:hover {
        color: ${theme.vars.palette.primary.dark};
        background-color: ${theme.vars.palette.primary.main}1a;
      }
    }
    
    &.success {
      color: ${theme.vars.palette.success.main};
      &:hover {
        color: ${theme.vars.palette.success.dark};
        background-color: ${theme.vars.palette.success.main}1a;
      }
    }
    
    &.Mui-disabled {
      color: ${theme.vars.palette.action.disabled};
    }
  }
`;

const getIcon = (variant: ConfirmIconVariant, fontSize: "small" | "medium" | "inherit") => {
  const size = fontSize === "medium" ? "medium" : "small";
  switch (variant) {
    case "done":
      return <DoneIcon fontSize={size} />;
    case "doneAll":
      return <DoneAllIcon fontSize={size} />;
    case "circle":
      return <CheckCircleIcon fontSize={size} />;
    case "circleOutline":
      return <CheckCircleOutlineIcon fontSize={size} />;
    case "check":
    default:
      return <CheckIcon fontSize={size} />;
  }
};

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  onClick,
  iconVariant = "check",
  size = "small",
  tooltip = "Confirm",
  disabled = false,
  color = "default",
  tooltipPlacement = "top",
  className
}) => {
  const theme = useTheme();
  const iconSize = size === "large" ? "medium" : "small";
  
  const button = (
    <IconButton
      className={`confirm-button nodrag ${color} ${className || ""}`}
      size={size}
      onClick={onClick}
      disabled={disabled}
      aria-label={tooltip}
    >
      {getIcon(iconVariant, iconSize)}
    </IconButton>
  );
  
  if (tooltip) {
    return (
      <span css={styles(theme)}>
        <Tooltip title={tooltip} enterDelay={TOOLTIP_ENTER_DELAY} placement={tooltipPlacement}>
          <span>{button}</span>
        </Tooltip>
      </span>
    );
  }
  
  return <span css={styles(theme)}>{button}</span>;
};

export default ConfirmButton;
