/**
 * Lazy-loaded wrapper for PDFViewer component.
 */

import React, { Suspense, lazy } from "react";
import { FlexColumn, Text, LoadingSpinner } from "../ui_primitives";
import type { Asset } from "../../stores/ApiTypes";

// Lazy load the heavy PDF viewer component
const PDFViewer = lazy(() =>
  import("./PDFViewer").then((module) => ({
    default: module.default
  }))
);

interface LazyPDFViewerProps {
  asset?: Asset;
  url?: string;
}

/**
 * Loading component shown while PDFViewer loads
 */
const PDFViewerLoadingFallback: React.FC = () => (
  <FlexColumn
    align="center"
    justify="center"
    gap={2}
    sx={{ height: "300px" }}
  >
    <LoadingSpinner size="medium" />
    <Text size="small" color="secondary">
      Loading PDF viewer...
    </Text>
  </FlexColumn>
);

/**
 * Lazy-loaded PDF viewer component.
 *
 * @example
 * ```tsx
 * <LazyPDFViewer asset={asset} />
 * ```
 */
const LazyPDFViewer: React.FC<LazyPDFViewerProps> = ({ asset, url }) => {
  return (
    <Suspense fallback={<PDFViewerLoadingFallback />}>
      <PDFViewer asset={asset} url={url} />
    </Suspense>
  );
};

export default LazyPDFViewer;
