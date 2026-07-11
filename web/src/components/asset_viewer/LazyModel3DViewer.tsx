// Lazy-loads Model3DViewer (Three.js ecosystem ~1MB) only when needed, to keep
// it out of the initial bundle.

import React, { Suspense, lazy } from "react";
import { FlexColumn, Text, LoadingSpinner } from "../ui_primitives";
import type { Asset } from "../../stores/ApiTypes";

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
        Loading 3D viewer…
      </Text>
    )}
  </FlexColumn>
);

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
