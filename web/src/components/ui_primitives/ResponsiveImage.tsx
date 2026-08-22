/**
 * ResponsiveImage Component
 *
 * An image component with loading states, error handling, and aspect ratio support.
 * Replaces 20+ instances of raw <img> tags with inconsistent styling patterns.
 */

import React, { useState } from "react";
import { Box, BoxProps, Skeleton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import { MOTION } from "./tokens";
import {
  useResolvedMediaUri,
  type MediaLocator
} from "../../hooks/useResolvedMediaUri";
import type { ResolvedMediaUrl } from "../../utils/resolveMediaUri";

export interface ResponsiveImageProps extends Omit<BoxProps, 'onError'> {
  /**
   * A resolved image URL. Only media resolution mints this type — an
   * `asset://` locator is not one, so pass `locator` instead.
   */
  src?: ResolvedMediaUrl | "";
  /**
   * A stored media locator (`asset://<id>`, a `*Ref`, or any other scheme).
   * The component resolves it before setting `src`, so a caller never has to.
   * Mutually exclusive with `src`.
   */
  locator?: MediaLocator;
  /** Alt text for accessibility */
  alt: string;
  /** Aspect ratio (e.g., "16/9", "1/1", "4/3") */
  aspectRatio?: string;
  /** How the image fits within its container */
  fit?: "cover" | "contain" | "fill" | "none";
  /** Border radius */
  borderRadius?: number | string;
  /** Show loading skeleton while image loads */
  showSkeleton?: boolean;
  /** Show fallback icon on error */
  showErrorFallback?: boolean;
  /** Error callback */
  onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  /** Load callback */
  onLoad?: () => void;
}

/** The rendering half: `src` is already resolved. */
const ResolvedImage: React.FC<
  Omit<ResponsiveImageProps, "locator"> & { src?: ResolvedMediaUrl | "" }
> = ({
  src,
  alt,
  aspectRatio,
  fit = "cover",
  borderRadius = 0,
  showSkeleton = false,
  showErrorFallback = true,
  onError,
  onLoad,
  sx,
  ...props
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    setLoading(false);
    onLoad?.();
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoading(false);
    setError(true);
    onError?.(e);
  };

  if (error && showErrorFallback) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          aspectRatio,
          borderRadius,
          backgroundColor: theme.vars.palette.grey[900],
          color: theme.vars.palette.grey[600],
          width: "100%",
          ...sx,
        }}
        {...props}
      >
        <BrokenImageIcon />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius,
        aspectRatio,
        width: "100%",
        ...sx,
      }}
      {...props}
    >
      {showSkeleton && loading && (
        <Skeleton
          variant="rectangular"
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      )}
      <Box
        component="img"
        src={src || undefined}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        sx={{
          width: "100%",
          height: "100%",
          objectFit: fit,
          display: "block",
          opacity: showSkeleton && loading ? 0 : 1,
          transition: MOTION.opacity,
        }}
      />
    </Box>
  );
};

ResolvedImage.displayName = "ResolvedImage";

/**
 * The locator branch. Split into its own component so `ResponsiveImage`'s
 * plain-URL callers never mount the asset query — the hook needs a
 * `QueryClientProvider`, and a `src`-only caller has nothing to look up.
 */
const LocatorImage: React.FC<
  Omit<ResponsiveImageProps, "src"> & { locator: MediaLocator }
> = ({ locator, ...rest }) => (
  <ResolvedImage {...rest} src={useResolvedMediaUri(locator) ?? ""} />
);

LocatorImage.displayName = "LocatorImage";

/**
 * ResponsiveImage - An image with loading and error states
 *
 * @example
 * // Basic usage
 * <ResponsiveImage locator="/photo.jpg" alt="A photo" />
 *
 * @example
 * // Fixed aspect ratio with cover
 * <ResponsiveImage locator={imageRef} alt="Thumbnail" aspectRatio="16/9" fit="cover" />
 *
 * @example
 * // With loading skeleton
 * <ResponsiveImage locator="asset://abc123" alt="Preview" showSkeleton borderRadius={8} />
 *
 * @example
 * // A URL media resolution already produced
 * <ResponsiveImage src={resolvedUrl} alt="User" aspectRatio="1/1" fit="cover" />
 */
export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  locator,
  ...rest
}) =>
  locator === undefined ? (
    <ResolvedImage {...rest} />
  ) : (
    <LocatorImage {...rest} locator={locator} />
  );

ResponsiveImage.displayName = "ResponsiveImage";
