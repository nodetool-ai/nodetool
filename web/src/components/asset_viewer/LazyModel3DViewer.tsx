/**
 * Lazy-loaded wrapper for Model3DViewer component.
 *
 * This component lazy-loads the Model3DViewer (Three.js ecosystem ~1MB)
 * only when actually needed, reducing initial bundle size.
 *
 * @module LazyModel3DViewer
 */

import React, { Suspense, lazy } from "react";
import { CircularProgress, Box, Typography } from "@mui/material";
import type { Asset } from "../../stores/ApiTypes";

// Lazy load the heavy 3D viewer component
const Model3DViewer = lazy(() =>
  import("./Model3DViewer").then((module) => ({
    default: module.default
  }))
);

interface LazyModel3DViewerProps {
  asset?: Asset;
  url?: string;
  compact?: boolean;
  onClick?: () => void;
}

/**
 * Loading component shown while Model3DViewer loads
 */
const Model3DViewerLoadingFallback: React.FC<{ compact?: boolean }> = ({
  compact
}) => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    height={compact ? "100%" : "300px"}
    minHeight={compact ? "60px" : "300px"}
    gap={compact ? 1 : 2}
  >
    <CircularProgress size={compact ? 20 : 40} />
    {!compact && (
      <Typography variant="body2" color="textSecondary">
        Loading 3D viewer...
      </Typography>
    )}
  </Box>
);

/**
 * Lazy-loaded 3D model viewer component.
 *
 * Wraps Model3DViewer in React.lazy and Suspense to defer loading
 * of the heavy Three.js ecosystem dependencies (~1MB including
 * three, @react-three/fiber, @react-three/drei) until a 3D model
 * is actually displayed.
 *
 * @example
 * ```tsx
 * <LazyModel3DViewer asset={asset} />
 * ```
 */
const LazyModel3DViewer: React.FC<LazyModel3DViewerProps> = ({
  asset,
  url,
  compact = false,
  onClick
}) => {
  return (
    <Suspense fallback={<Model3DViewerLoadingFallback compact={compact} />}>
      <Model3DViewer asset={asset} url={url} compact={compact} onClick={onClick} />
    </Suspense>
  );
};

export default LazyModel3DViewer;
