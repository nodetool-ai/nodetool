/**
 * Skeleton Component
 *
 * A loading placeholder primitive wrapping MUI Skeleton with
 * semantic size presets and consistent styling.
 */

import React, { memo } from "react";
import MuiSkeleton, {
  SkeletonProps as MuiSkeletonProps
} from "@mui/material/Skeleton";

export interface SkeletonProps extends MuiSkeletonProps {
  /** Preset size for common placeholder shapes */
  preset?: "text" | "avatar" | "thumbnail" | "card" | "button";
}

const PRESET_STYLES: Record<
  NonNullable<SkeletonProps["preset"]>,
  { variant: MuiSkeletonProps["variant"]; width: number | string; height: number | string }
> = {
  text: { variant: "text", width: "100%", height: 20 },
  avatar: { variant: "circular", width: 40, height: 40 },
  thumbnail: { variant: "rectangular", width: 80, height: 80 },
  card: { variant: "rectangular", width: "100%", height: 160 },
  button: { variant: "rectangular", width: 100, height: 36 }
};

/**
 * Skeleton - Loading placeholder
 *
 * @example
 * // Text placeholder
 * <Skeleton preset="text" />
 *
 * @example
 * // Avatar placeholder
 * <Skeleton preset="avatar" />
 *
 * @example
 * // Custom size
 * <Skeleton variant="rectangular" width={200} height={120} />
 *
 * @example
 * // Card placeholder with animation
 * <Skeleton preset="card" animation="wave" />
 */
const SkeletonInternal: React.FC<SkeletonProps> = ({
  preset,
  variant,
  width,
  height,
  ...props
}) => {
  // Type presetStyles as partial object to handle both preset and non-preset cases
  const presetStyles: Partial<typeof PRESET_STYLES[keyof typeof PRESET_STYLES]> = preset ? PRESET_STYLES[preset] : {};

  return (
    <MuiSkeleton
      variant={variant ?? presetStyles.variant ?? "rectangular"}
      width={width ?? presetStyles.width}
      height={height ?? presetStyles.height}
      {...props}
    />
  );
};

export const Skeleton = memo(SkeletonInternal);
