/**
 * AutoGrid Component
 *
 * A responsive CSS grid that fills a row with as many columns of at least
 * `minItemWidth` as fit. Replaces hand-written
 * `repeat(auto-fill, minmax(Npx, 1fr))` grid declarations.
 */

import React, { forwardRef, memo } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { SPACING, resolveSpacing, type SpacingValue } from "./spacing";

export interface AutoGridProps {
  /** Minimum column width in px, default 200 */
  minItemWidth?: number;
  /** Gap (SPACING units), default SPACING.md (8px) */
  gap?: SpacingValue;
  /**
   * `auto-fill` keeps empty tracks (items stay their min width in a sparse row);
   * `auto-fit` collapses them so items stretch. Default "fill".
   */
  fill?: "fill" | "fit";
  children?: React.ReactNode;
  className?: string;
  sx?: SxProps<Theme>;
  role?: string;
  "aria-label"?: string;
}

/**
 * AutoGrid - A responsive auto-fill/auto-fit grid
 *
 * @example
 * // Tiles at least 180px wide, 12px gap
 * <AutoGrid minItemWidth={180} gap={SPACING.lg}>
 *   {items.map((item) => <Tile key={item.id} {...item} />)}
 * </AutoGrid>
 *
 * @example
 * // Stretch items to fill the row instead of leaving empty tracks
 * <AutoGrid minItemWidth={240} fill="fit" role="list" aria-label="Assets">
 *   {assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}
 * </AutoGrid>
 */
export const AutoGrid = memo(
  forwardRef<HTMLDivElement, AutoGridProps>(
    (
      {
        minItemWidth = 200,
        gap = SPACING.md,
        fill = "fill",
        children,
        className,
        sx,
        role,
        "aria-label": ariaLabel
      },
      ref
    ) => {
      const theme = useTheme();

      return (
        <Box
          ref={ref}
          className={className}
          role={role}
          aria-label={ariaLabel}
          sx={[
            {
              display: "grid",
              gridTemplateColumns: `repeat(auto-${fill}, minmax(${minItemWidth}px, 1fr))`,
              gap: theme.spacing(resolveSpacing(gap))
            },
            // Compose caller sx as an array entry so the function form `(theme) =>
            // ({...})` is honored — spreading `...sx` silently drops callbacks.
            ...(Array.isArray(sx) ? sx : [sx])
          ]}
        >
          {children}
        </Box>
      );
    }
  )
);

AutoGrid.displayName = "AutoGrid";
