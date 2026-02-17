/**
 * Lazy-loaded wrapper for PDFViewer component.
 *
 * This component lazy-loads the PDFViewer (react-pdf + pdfjs-dist ~8MB)
 * only when actually needed, reducing initial bundle size.
 *
 * @module LazyPDFViewer
 */

import React, { Suspense, lazy } from "react";
import { CircularProgress, Box, Typography } from "@mui/material";
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
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    height="300px"
    gap={2}
  >
    <CircularProgress size={40} />
    <Typography variant="body2" color="textSecondary">
      Loading PDF viewer...
    </Typography>
  </Box>
);

/**
 * Lazy-loaded PDF viewer component.
 *
 * Wraps PDFViewer in React.lazy and Suspense to defer loading
 * of the heavy react-pdf and pdfjs-dist dependencies (~8MB) until
 * a PDF is actually displayed.
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
