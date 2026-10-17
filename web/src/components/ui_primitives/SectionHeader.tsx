/**
 * SectionHeader Component
 *
 * A consistent section header with title and optional action area.
 * Replaces repeated flex-row header patterns with title + actions across the codebase.
 */

import React from "react";
import { Box, BoxProps, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SPACING } from "./spacing";
import { EYEBROW, TYPOGRAPHY } from "./tokens";

export interface SectionHeaderProps extends BoxProps {
  /** Section title text */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Item count shown after the title in caption style */
  count?: React.ReactNode;
  /** Heading element for the title. Defaults to a paragraph. */
  titleComponent?: "h2" | "h3" | "h4" | "p" | "span";
  /** Action element(s) rendered on the right side */
  action?: React.ReactNode;
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Uppercase title (medium and large; small is always uppercase) */
  uppercase?: boolean;
}

/**
 * SectionHeader - A titled header with optional action area
 *
 * @example
 * // Basic section header
 * <SectionHeader title="Recent Items" />
 *
 * @example
 * // With action button
 * <SectionHeader title="Settings" action={<Button>Reset</Button>} />
 *
 * @example
 * // Small uppercase header (for sidebar sections)
 * <SectionHeader title="Filters" size="small" uppercase />
 *
 * @example
 * // With subtitle
 * <SectionHeader title="Workflows" subtitle="Your saved workflows" />
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  count,
  action,
  size = "medium",
  uppercase = false,
  titleComponent,
  sx,
  ...props
}) => {
  const theme = useTheme();

  // Each size maps onto a sanctioned type style. `small` is the eyebrow used
  // to group rows inside a panel: the shared `EYEBROW` token (the same style
  // `InspectorSectionTitle` draws), always uppercase, muted.
  const titleStyle =
    size === "small"
      ? { ...EYEBROW, color: theme.vars.palette.text.secondary }
      : {
          ...(size === "large" ? TYPOGRAPHY.sans.title : TYPOGRAPHY.sans.label),
          color: theme.vars.palette.text.primary,
          ...(uppercase && {
            textTransform: EYEBROW.textTransform,
            letterSpacing: EYEBROW.letterSpacing
          })
        };
  const paddingY = { small: SPACING.xs, medium: SPACING.sm, large: SPACING.md }[size];

  return (
    <Box
      sx={[
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: paddingY,
          px: SPACING.none
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
      ]}
      {...props}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: SPACING.md }}>
          <Typography
            className="section-header-title"
            component={titleComponent ?? "p"}
            sx={{ ...titleStyle, margin: 0 }}
          >
            {title}
          </Typography>
          {count !== undefined && count !== null && (
            <Box
              component="span"
              className="section-header-count"
              sx={{
                ...TYPOGRAPHY.sans.caption,
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
                color: theme.vars.palette.text.secondary
              }}
            >
              {count}
            </Box>
          )}
        </Box>
        {subtitle && (
          <Typography
            sx={{
              ...TYPOGRAPHY.sans.caption,
              color: theme.vars.palette.text.secondary,
              mt: SPACING.micro
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && (
        <Box sx={{ flexShrink: 0, ml: SPACING.xs }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

SectionHeader.displayName = "SectionHeader";
