/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Popover, Typography, Box } from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import HelpIcon from "@mui/icons-material/Help";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface InfoTooltipProps {
  /** Content to display (string or React node) */
  content: React.ReactNode;
  /** Title for the tooltip */
  title?: string;
  /** Icon variant */
  iconVariant?: "info" | "infoOutlined" | "help" | "helpOutlined";
  /** Display mode - tooltip (hover) or popover (click) */
  mode?: "tooltip" | "popover";
  /** Size of the icon button */
  size?: "small" | "medium" | "large";
  /** Color variant */
  color?: "default" | "primary" | "secondary";
  /** Placement of tooltip/popover */
  placement?: "top" | "bottom" | "left" | "right" | "top-start" | "top-end" | "bottom-start" | "bottom-end";
  /** Maximum width of popover content */
  maxWidth?: number;
  /** Additional className */
  className?: string;
}

const styles = (theme: Theme) => css`
  display: inline-flex;
  
  .info-button {
    color: ${theme.vars.palette.text.secondary};
    padding: 4px;
    transition: all 0.2s ease;
    
    &:hover {
      color: ${theme.vars.palette.primary.main};
      background-color: ${theme.vars.palette.action.hover};
    }
    
    &.primary {
      color: ${theme.vars.palette.primary.main};
      &:hover {
        color: ${theme.vars.palette.primary.dark};
      }
    }
    
    &.secondary {
      color: ${theme.vars.palette.secondary.main};
      &:hover {
        color: ${theme.vars.palette.secondary.dark};
      }
    }
  }
`;

const popoverStyles = (theme: Theme) => css`
  .popover-content {
    padding: 16px;
    max-width: var(--max-width, 300px);
    
    .popover-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: ${theme.vars.palette.text.primary};
    }
    
    .popover-body {
      color: ${theme.vars.palette.text.secondary};
      font-size: 14px;
      line-height: 1.5;
    }
  }
`;

const getIcon = (variant: InfoTooltipProps["iconVariant"], fontSize: "small" | "medium" | "inherit") => {
  const size = fontSize === "medium" ? "medium" : "small";
  switch (variant) {
    case "infoOutlined":
      return <InfoOutlinedIcon fontSize={size} />;
    case "help":
      return <HelpIcon fontSize={size} />;
    case "helpOutlined":
      return <HelpOutlineIcon fontSize={size} />;
    case "info":
    default:
      return <InfoIcon fontSize={size} />;
  }
};

export const InfoTooltip: React.FC<InfoTooltipProps> = memo(({
  content,
  title,
  iconVariant = "infoOutlined",
  mode = "tooltip",
  size = "small",
  color = "default",
  placement = "top",
  maxWidth = 300,
  className
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (mode === "popover") {
        setAnchorEl(event.currentTarget);
      }
    },
    [mode]
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);
  
  const iconSize = size === "large" ? "medium" : "small";
  const icon = getIcon(iconVariant, iconSize);
  
  const button = (
    <IconButton
      className={`info-button nodrag ${color}`}
      size={size}
      onClick={handleClick}
      aria-label={title || "More information"}
    >
      {icon}
    </IconButton>
  );
  
  if (mode === "tooltip") {
    const tooltipContent = title ? (
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="body2">{content}</Typography>
      </Box>
    ) : content;
    
    return (
      <div className={`info-tooltip nodrag ${className || ""}`} css={styles(theme)}>
        <Tooltip
          title={tooltipContent}
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement={placement}
          arrow
        >
          {button}
        </Tooltip>
      </div>
    );
  }
  
  // Popover mode - parse placement for anchor and transform origins
  const getPopoverOrigins = (placement: string) => {
    const vertical: "top" | "bottom" = placement.includes("top") ? "top" : "bottom";
    let horizontal: "left" | "center" | "right" = "center";
    if (placement.includes("start") || placement === "left") {
      horizontal = "left";
    }
    if (placement.includes("end") || placement === "right") {
      horizontal = "right";
    }
    
    return {
      anchor: { vertical, horizontal },
      transform: { 
        vertical: (vertical === "top" ? "bottom" : "top") as "top" | "bottom", 
        horizontal 
      }
    };
  };
  
  const origins = getPopoverOrigins(placement);
  
  return (
    <div className={`info-tooltip nodrag ${className || ""}`} css={styles(theme)}>
      {button}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: origins.anchor.vertical,
          horizontal: origins.anchor.horizontal
        }}
        transformOrigin={{
          vertical: origins.transform.vertical,
          horizontal: origins.transform.horizontal
        }}
        css={popoverStyles(theme)}
        style={{ "--max-width": `${maxWidth}px` } as React.CSSProperties}
      >
        <Box className="popover-content">
          {title && (
            <Typography className="popover-title" variant="subtitle1">
              {title}
            </Typography>
          )}
          <Box className="popover-body">{content}</Box>
        </Box>
      </Popover>
    </div>
  );
});

InfoTooltip.displayName = "InfoTooltip";

export default InfoTooltip;
