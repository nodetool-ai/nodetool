/**
 * SectionHeader Component
 *
 * A consistent section header with title and optional action area.
 * Replaces repeated flex-row header patterns with title + actions across the codebase.
 */

import React from "react";
import { Box, BoxProps, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface SectionHeaderProps extends BoxProps {
  /** Section title text */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Action element(s) rendered on the right side */
  action?: React.ReactNode;
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Uppercase title */
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
  action,
  size = "medium",
  uppercase = false,
  sx,
  ...props
}) => {
  const theme = useTheme();

  // Each size maps onto a sanctioned type style. `small` is the eyebrow used
  // to group rows inside a panel: caption type, always uppercase, muted.
  const sizeStyles = {
    small: {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 400,
      padding: theme.spacing(1, 0),
      uppercase: true,
      color: theme.vars.palette.text.secondary
    },
    medium: {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      padding: theme.spacing(1.5, 0),
      uppercase,
      color: theme.vars.palette.text.primary
    },
    large: {
      fontSize: theme.fontSizeBig,
      fontWeight: 600,
      padding: theme.spacing(2, 0),
      uppercase,
      color: theme.vars.palette.text.primary
    }
  };

  const currentSize = sizeStyles[size];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: currentSize.padding,
        ...sx,
      }}
      {...props}
    >
      <Box>
        <Typography
          sx={{
            fontSize: currentSize.fontSize,
            fontWeight: currentSize.fontWeight,
            color: currentSize.color,
            textTransform: currentSize.uppercase ? "uppercase" : "none",
            letterSpacing: currentSize.uppercase ? "0.06em" : undefined,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              fontSize: "var(--fontSizeSmaller)",
              color: theme.vars.palette.text.secondary,
              mt: 0.5,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && (
        <Box sx={{ flexShrink: 0, ml: 1 }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

SectionHeader.displayName = "SectionHeader";
