// Lazy-loads PDFViewer (react-pdf + pdfjs-dist ~8MB) only when needed, to keep
// it out of the initial bundle.

import React, { Suspense, lazy } from "react";
import { FlexColumn, LoadingSpinner, SPACING } from "../ui_primitives";
import type { Asset } from "../../stores/ApiTypes";

const PDFViewer = lazy(() =>
  import("./PDFViewer").then((module) => ({
    default: module.default
  }))
);

interface LazyPDFViewerProps {
  asset?: Asset;
  url?: string;
}

const PDFViewerLoadingFallback: React.FC = () => (
  <FlexColumn
    align="center"
    justify="center"
    gap={SPACING.md}
    sx={{ height: "300px" }}
  >
    <LoadingSpinner size="medium" text="Loading PDF viewer" />
  </FlexColumn>
);

const LazyPDFViewer: React.FC<LazyPDFViewerProps> = ({ asset, url }) => {
  return (
    <Suspense fallback={<PDFViewerLoadingFallback />}>
      <PDFViewer asset={asset} url={url} />
    </Suspense>
  );
};

export default LazyPDFViewer;
