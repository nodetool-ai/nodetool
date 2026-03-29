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

export interface ResponsiveImageProps extends Omit<BoxProps, 'onError'> {
  /** Image source URL */
  src: string;
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

/**
 * ResponsiveImage - An image with loading and error states
 *
 * @example
 * // Basic usage
 * <ResponsiveImage src="/photo.jpg" alt="A photo" />
 *
 * @example
 * // Fixed aspect ratio with cover
 * <ResponsiveImage src={url} alt="Thumbnail" aspectRatio="16/9" fit="cover" />
 *
 * @example
 * // With loading skeleton
 * <ResponsiveImage src={url} alt="Preview" showSkeleton borderRadius={8} />
 *
 * @example
 * // Square avatar-like image
 * <ResponsiveImage src={avatarUrl} alt="User" aspectRatio="1/1" fit="cover" borderRadius="50%" />
 */
export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
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
        src={src}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        sx={{
          width: "100%",
          height: "100%",
          objectFit: fit,
          display: "block",
          opacity: showSkeleton && loading ? 0 : 1,
          transition: "opacity 0.2s ease",
        }}
      />
    </Box>
  );
};

ResponsiveImage.displayName = "ResponsiveImage";
