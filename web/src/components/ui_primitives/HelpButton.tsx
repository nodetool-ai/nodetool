/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import HelpIcon from "@mui/icons-material/Help";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import LiveHelpIcon from "@mui/icons-material/LiveHelp";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export type HelpIconVariant = "help" | "helpOutline" | "question" | "liveHelp";

export interface HelpButtonProps {
  /** Click handler */
  onClick: () => void;
  /** Icon variant */
  iconVariant?: HelpIconVariant;
  /** Button size */
  size?: "small" | "medium" | "large";
  /** Tooltip text */
  tooltip?: string;
  /** Whether the help mode is active */
  active?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Tooltip placement */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  /** Additional className */
  className?: string;
}

const styles = (theme: Theme) => css`
  .help-button {
    color: ${theme.vars.palette.text.secondary};
    transition: all 0.2s ease;
    border: 1px solid transparent;
    
    &:hover {
      color: ${theme.vars.palette.primary.main};
      background-color: ${theme.vars.palette.action.hover};
    }
    
    &.active {
      color: ${theme.vars.palette.primary.main};
      background-color: ${theme.vars.palette.primary.main}1a;
      border-color: ${theme.vars.palette.primary.main}40;
    }
    
    &.Mui-disabled {
      color: ${theme.vars.palette.action.disabled};
    }
  }
`;

const getIcon = (variant: HelpIconVariant, fontSize: "small" | "medium" | "inherit") => {
  const size = fontSize === "medium" ? "medium" : "small";
  switch (variant) {
    case "helpOutline":
      return <HelpOutlineIcon fontSize={size} />;
    case "question":
      return <QuestionMarkIcon fontSize={size} />;
    case "liveHelp":
      return <LiveHelpIcon fontSize={size} />;
    case "help":
    default:
      return <HelpIcon fontSize={size} />;
  }
};

export const HelpButton: React.FC<HelpButtonProps> = ({
  onClick,
  iconVariant = "helpOutline",
  size = "small",
  tooltip = "Help",
  active = false,
  disabled = false,
  tooltipPlacement = "top",
  className
}) => {
  const theme = useTheme();
  const iconSize = size === "large" ? "medium" : "small";
  
  const button = (
    <IconButton
      className={`help-button nodrag ${active ? "active" : ""} ${className || ""}`}
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

export default HelpButton;
