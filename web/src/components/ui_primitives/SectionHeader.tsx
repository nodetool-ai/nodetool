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

  const sizeStyles = {
    small: {
      fontSize: "11px",
      fontWeight: 600,
      padding: "4px 0",
    },
    medium: {
      fontSize: theme.fontSizeSmall || "13px",
      fontWeight: 600,
      padding: "6px 0",
    },
    large: {
      fontSize: theme.fontSizeNormal || "14px",
      fontWeight: 700,
      padding: "8px 0",
    },
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
            color: theme.vars.palette.text.primary,
            textTransform: uppercase ? "uppercase" : "none",
            letterSpacing: uppercase ? "0.5px" : undefined,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              fontSize: "11px",
              color: theme.vars.palette.text.secondary,
              mt: 0.25,
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
