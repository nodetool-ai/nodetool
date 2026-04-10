/**
 * Lazy-loaded wrapper for Model3DViewer component.
 *
 * This component lazy-loads the Model3DViewer (Three.js ecosystem ~1MB)
 * only when actually needed, reducing initial bundle size.
 *
 * @module LazyModel3DViewer
 */

import React, { Suspense, lazy } from "react";
import { FlexColumn, Text, LoadingSpinner } from "../ui_primitives";
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
  onDoubleClick?: () => void;
}

/**
 * Loading component shown while Model3DViewer loads
 */
const Model3DViewerLoadingFallback: React.FC<{ compact?: boolean }> = ({
  compact
}) => (
  <FlexColumn
    align="center"
    justify="center"
    gap={compact ? 1 : 2}
    sx={{
      height: compact ? "100%" : "300px",
      minHeight: compact ? "60px" : "300px"
    }}
  >
    <LoadingSpinner size={compact ? "small" : "medium"} />
    {!compact && (
      <Text size="small" color="secondary">
        Loading 3D viewer...
      </Text>
    )}
  </FlexColumn>
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
  onClick,
  onDoubleClick
}) => {
  return (
    <Suspense fallback={<Model3DViewerLoadingFallback compact={compact} />}>
      <Model3DViewer
        asset={asset}
        url={url}
        compact={compact}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    </Suspense>
  );
};

export default LazyModel3DViewer;
