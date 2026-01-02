/** @jsxImportSource @emotion/react */
import React from "react";
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorIcon from "@mui/icons-material/Error";
import InfoIcon from "@mui/icons-material/Info";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export type BannerVariant = "warning" | "error" | "info";

export interface WarningBannerProps {
  /** Main message */
  message: string;
  /** Secondary description */
  description?: string;
  /** Banner variant */
  variant?: BannerVariant;
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Action button content */
  action?: React.ReactNode;
  /** Callback for action button */
  onAction?: () => void;
  /** Whether to show pulse animation */
  animate?: boolean;
  /** Additional className */
  className?: string;
  /** Compact mode */
  compact?: boolean;
}

const pulseAnimation = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

const styles = (theme: Theme, variant: BannerVariant, animate: boolean) => {
  const colors = {
    warning: {
      bg: `${theme.vars.palette.warning.main}1a`,
      border: theme.vars.palette.warning.main,
      icon: theme.vars.palette.warning.main,
      text: theme.vars.palette.warning.dark
    },
    error: {
      bg: `${theme.vars.palette.error.main}1a`,
      border: theme.vars.palette.error.main,
      icon: theme.vars.palette.error.main,
      text: theme.vars.palette.error.dark
    },
    info: {
      bg: `${theme.vars.palette.info.main}1a`,
      border: theme.vars.palette.info.main,
      icon: theme.vars.palette.info.main,
      text: theme.vars.palette.info.dark
    }
  };
  
  const c = colors[variant];
  
  return css`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    background-color: ${c.bg};
    border: 1px solid ${c.border}40;
    animation: ${animate ? css`${pulseAnimation} 2s ease-in-out infinite` : "none"};
    
    &.compact {
      padding: 8px 12px;
      gap: 8px;
    }
    
    .banner-icon {
      color: ${c.icon};
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    .banner-content {
      flex: 1;
      min-width: 0;
    }
    
    .banner-message {
      color: ${theme.vars.palette.text.primary};
      font-weight: 500;
      line-height: 1.4;
    }
    
    .banner-description {
      color: ${theme.vars.palette.text.secondary};
      font-size: 13px;
      margin-top: 4px;
      line-height: 1.4;
    }
    
    .banner-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    
    .dismiss-button {
      color: ${theme.vars.palette.text.secondary};
      padding: 4px;
      
      &:hover {
        color: ${theme.vars.palette.text.primary};
        background-color: ${theme.vars.palette.action.hover};
      }
    }
  `;
};

const getIcon = (variant: BannerVariant) => {
  switch (variant) {
    case "error":
      return <ErrorIcon className="banner-icon" />;
    case "info":
      return <InfoIcon className="banner-icon" />;
    case "warning":
    default:
      return <WarningAmberIcon className="banner-icon" />;
  }
};

export const WarningBanner: React.FC<WarningBannerProps> = ({
  message,
  description,
  variant = "warning",
  dismissible = false,
  onDismiss,
  action,
  onAction,
  animate = false,
  className,
  compact = false
}) => {
  const theme = useTheme();
  
  return (
    <Box 
      className={`warning-banner nodrag ${compact ? "compact" : ""} ${className || ""}`}
      css={styles(theme, variant, animate)}
      role="alert"
    >
      {getIcon(variant)}
      
      <Box className="banner-content">
        <Typography className="banner-message" variant="body2">
          {message}
        </Typography>
        {description && (
          <Typography className="banner-description" variant="body2">
            {description}
          </Typography>
        )}
      </Box>
      
      <Box className="banner-actions">
        {action && onAction && (
          <Box onClick={onAction}>{action}</Box>
        )}
        {dismissible && onDismiss && (
          <Tooltip title="Dismiss" enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton
              className="dismiss-button"
              size="small"
              onClick={onDismiss}
              aria-label="Dismiss"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default WarningBanner;
