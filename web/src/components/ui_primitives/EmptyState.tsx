/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, Button } from "@mui/material";
import InboxIcon from "@mui/icons-material/Inbox";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

const styles = (theme: Theme, size: string) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: size === "small" ? theme.spacing(2) : size === "large" ? theme.spacing(6) : theme.spacing(4),
    textAlign: "center",
    ".empty-icon": {
      color: theme.vars.palette.text.disabled,
      marginBottom: theme.spacing(2),
      fontSize: size === "small" ? 40 : size === "large" ? 80 : 60
    },
    ".empty-title": {
      color: theme.vars.palette.text.primary,
      marginBottom: theme.spacing(1),
      fontWeight: 500
    },
    ".empty-description": {
      color: theme.vars.palette.text.secondary,
      maxWidth: 400,
      marginBottom: theme.spacing(2)
    },
    ".empty-action": {
      marginTop: theme.spacing(1)
    }
  });

export type EmptyStateVariant = "empty" | "no-results" | "no-data" | "offline" | "error";

export interface EmptyStateProps {
  /** Visual variant */
  variant?: EmptyStateVariant;
  /** Custom icon to display */
  icon?: React.ReactNode;
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Action button text */
  actionText?: string;
  /** Action button callback */
  onAction?: () => void;
  /** Size of the empty state */
  size?: "small" | "medium" | "large";
  /** Custom class name */
  className?: string;
}

const defaultContent: Record<EmptyStateVariant, { icon: React.ReactNode; title: string; description: string }> = {
  empty: {
    icon: <InboxIcon className="empty-icon" />,
    title: "Nothing here yet",
    description: "Get started by creating your first item."
  },
  "no-results": {
    icon: <SearchOffIcon className="empty-icon" />,
    title: "No results found",
    description: "Try adjusting your search or filters."
  },
  "no-data": {
    icon: <FolderOffIcon className="empty-icon" />,
    title: "No data available",
    description: "Data will appear here when available."
  },
  offline: {
    icon: <CloudOffIcon className="empty-icon" />,
    title: "You're offline",
    description: "Check your internet connection and try again."
  },
  error: {
    icon: <ErrorOutlineIcon className="empty-icon" />,
    title: "Something went wrong",
    description: "An error occurred. Please try again."
  }
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = "empty",
  icon,
  title,
  description,
  actionText,
  onAction,
  size = "medium",
  className
}) => {
  const theme = useTheme();
  const defaults = defaultContent[variant];

  const displayIcon = icon || defaults.icon;
  const displayTitle = title || defaults.title;
  const displayDescription = description || defaults.description;

  const titleVariant = size === "small" ? "body1" : size === "large" ? "h5" : "h6";
  const descriptionVariant = size === "small" ? "caption" : "body2";

  return (
    <Box css={styles(theme, size)} className={`empty-state ${className || ""}`}>
      {displayIcon}
      <Typography variant={titleVariant} className="empty-title">
        {displayTitle}
      </Typography>
      {displayDescription && (
        <Typography variant={descriptionVariant} className="empty-description">
          {displayDescription}
        </Typography>
      )}
      {actionText && onAction && (
        <Button
          variant="outlined"
          onClick={onAction}
          className="empty-action"
          size={size === "large" ? "large" : size === "small" ? "small" : "medium"}
        >
          {actionText}
        </Button>
      )}
    </Box>
  );
};

export default EmptyState;
