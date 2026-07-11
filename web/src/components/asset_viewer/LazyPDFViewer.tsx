// Lazy-loads PDFViewer (react-pdf + pdfjs-dist ~8MB) only when needed, to keep
// it out of the initial bundle.

import React, { Suspense, lazy } from "react";
import { FlexColumn, Text, LoadingSpinner } from "../ui_primitives";
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
    gap={2}
    sx={{ height: "300px" }}
  >
    <LoadingSpinner size="medium" />
    <Text size="small" color="secondary">
      Loading PDF viewer…
    </Text>
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
