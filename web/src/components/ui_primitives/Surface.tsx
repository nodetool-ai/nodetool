/**
 * Surface Component
 *
 * A semantic wrapper around MUI Paper for elevated/contained surfaces.
 * Provides consistent elevation, border, and background defaults.
 * Complements Card (structured content) and Panel (layout regions).
 */

import React, { memo, forwardRef } from "react";
import {
  Paper,
  PaperProps,
} from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";

export interface SurfaceProps extends Omit<PaperProps, "elevation"> {
  /** Elevation level (0-4). 0 = flat with border, 1-4 = shadow depth */
  elevation?: 0 | 1 | 2 | 3 | 4;
  /** Padding (theme spacing units) */
  padding?: number | string;
  /** Border radius preset */
  rounded?: "none" | "small" | "medium" | "large";
  /** Whether to show a subtle border */
  bordered?: boolean;
  /** Background variant */
  background?: "default" | "paper" | "transparent";
}

const RADIUS_MAP: Record<
  NonNullable<SurfaceProps["rounded"]>,
  keyof Theme["rounded"] | "none"
> = {
  none: "none",
  small: "sm",
  medium: "lg",
  large: "xxl",
};

/**
 * Surface - A themed container surface
 *
 * @example
 * // Flat bordered surface
 * <Surface bordered padding={2}>
 *   <Text>Content on a flat surface</Text>
 * </Surface>
 *
 * @example
 * // Elevated surface
 * <Surface elevation={2} rounded="medium" padding={3}>
 *   <Text>Elevated content</Text>
 * </Surface>
 *
 * @example
 * // Transparent surface with border
 * <Surface bordered background="transparent" rounded="small" padding={1.5}>
 *   <CodeBlock />
 * </Surface>
 */
export const Surface = memo(
  forwardRef<HTMLDivElement, SurfaceProps>(
    (
      {
        elevation = 0,
        padding,
        rounded = "medium",
        bordered = false,
        background = "paper",
        sx,
        children,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const bgMap = {
        default: theme.palette.background.default,
        paper: theme.palette.background.paper,
        transparent: "transparent",
      };

      return (
        <Paper
          ref={ref}
          elevation={elevation}
          sx={{
            borderRadius:
              RADIUS_MAP[rounded] === "none"
                ? 0
                : theme.rounded[RADIUS_MAP[rounded] as keyof Theme["rounded"]],
            padding:
              typeof padding === "number"
                ? theme.spacing(padding)
                : padding,
            backgroundColor: bgMap[background],
            ...(bordered && {
              border: `1px solid ${theme.palette.divider}`,
            }),
            ...(elevation === 0 && {
              boxShadow: "none",
            }),
            ...sx,
          }}
          {...props}
        >
          {children}
        </Paper>
      );
    }
  )
);

Surface.displayName = "Surface";
