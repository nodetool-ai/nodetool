/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, Button } from "@mui/material";
import InboxIcon from "@mui/icons-material/Inbox";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { SPACING, getSpacingPx } from "./spacing";
import { TYPOGRAPHY } from "./tokens";

const ICON_SIZE = { small: 32, medium: 48, large: 64 } as const;

const PADDING_BY_SIZE = {
  small: SPACING.md,
  medium: SPACING.xl,
  large: SPACING.xxl
} as const;

const styles = (theme: Theme, size: EmptyStateSize) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: getSpacingPx(SPACING.md),
    padding: getSpacingPx(PADDING_BY_SIZE[size]),
    textAlign: "center",
    // Any icon, a variant default or one passed in, takes the size's icon size.
    "& > svg:first-of-type": {
      color: theme.vars.palette.text.disabled,
      fontSize: ICON_SIZE[size],
      marginBottom: getSpacingPx(SPACING.xs)
    },
    ".empty-title": {
      ...(size === "small" ? TYPOGRAPHY.sans.label : TYPOGRAPHY.sans.title),
      color: theme.vars.palette.text.primary
    },
    ".empty-description": {
      ...(size === "small" ? TYPOGRAPHY.sans.caption : TYPOGRAPHY.sans.body),
      color: theme.vars.palette.text.secondary,
      maxWidth: 400
    },
    ".empty-action": {
      marginTop: getSpacingPx(SPACING.md)
    }
  });

type EmptyStateSize = "small" | "medium" | "large";

export type EmptyStateVariant = "empty" | "no-results" | "no-data" | "offline" | "error";

export interface EmptyStateProps {
  /** Visual variant */
  variant?: EmptyStateVariant;
  /** Custom icon to display */
  icon?: React.ReactNode;
  /** Title text */
  title?: string;
  /** Description text or element */
  description?: React.ReactNode;
  /** Action button text */
  actionText?: string;
  /** Action button callback */
  onAction?: () => void;
  /** Size of the empty state */
  size?: EmptyStateSize;
  /** Custom class name */
  className?: string;
}

const defaultContent = {
  empty: {
    icon: <InboxIcon className="empty-icon" />,
    titleKey: "empty.title",
    descriptionKey: "empty.description"
  },
  "no-results": {
    icon: <SearchOffIcon className="empty-icon" />,
    titleKey: "noResults.title",
    descriptionKey: "noResults.description"
  },
  "no-data": {
    icon: <FolderOffIcon className="empty-icon" />,
    titleKey: "noData.title",
    descriptionKey: "noData.description"
  },
  offline: {
    icon: <CloudOffIcon className="empty-icon" />,
    titleKey: "offline.title",
    descriptionKey: "offline.description"
  },
  error: {
    icon: <ErrorOutlineIcon className="empty-icon" />,
    titleKey: "error.title",
    descriptionKey: "error.description"
  }
} satisfies Record<
  EmptyStateVariant,
  { icon: React.ReactNode; titleKey: string; descriptionKey: string }
>;

export const EmptyState: React.FC<EmptyStateProps> = memo(({
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
  const { t } = useTranslation();
  const defaults = defaultContent[variant];

  const displayIcon = icon || defaults.icon;
  const displayTitle = title || t(`i18n-next85.uiPrimitives.emptyState.${defaults.titleKey}`);
  // The variant's description belongs to the variant's title. A caller with
  // its own title gets only the description it passes.
  const displayDescription =
    description ||
    (title
      ? undefined
      : t(`i18n-next85.uiPrimitives.emptyState.${defaults.descriptionKey}`));

  const titleVariant = size === "small" ? "body1" : size === "large" ? "h5" : "h6";
  const descriptionVariant = size === "small" ? "caption" : "body2";

  return (
    <Box
      css={styles(theme, size)}
      className={`empty-state ${className || ""}`}
      role="status"
      aria-live="polite"
    >
      {displayIcon}
      <Typography variant={titleVariant} className="empty-title">
        {displayTitle}
      </Typography>
      {displayDescription && (
        <Typography variant={descriptionVariant} className="empty-description" component="div">
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
});

EmptyState.displayName = "EmptyState";

export default EmptyState;
