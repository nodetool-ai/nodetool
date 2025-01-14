/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Asset } from "../../stores/ApiTypes";
import { Typography, CircularProgress } from "@mui/material";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PDFViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "100%",
      height: "calc(100% - 120px)",
      marginTop: "2em",
      overflow: "auto"
    },
    ".pdf-document": {
      width: "90%",
      backgroundColor: theme.palette.c_gray1,
      "& .react-pdf__Page": {
        marginBottom: "1em"
      },
      "& .react-pdf__Page__canvas": {
        maxWidth: "100%",
        height: "auto !important"
      }
    }
  });

/**
 * PDFViewer component, used to display a PDF document for a given asset.
 */
const PDFViewer: React.FC<PDFViewerProps> = ({ asset, url }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [error, setError] = useState<Error | null>(null);

  const pdfUrl = asset?.get_url || url;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1); // Reset to first page when loading new document
  }

  function onDocumentLoadError(error: Error) {
    setError(error);
  }

  return (
    <div className="pdf-viewer" css={styles}>
      <Typography variant="body2">{asset?.content_type}</Typography>
      <Document
        className="pdf-document"
        file={pdfUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={<CircularProgress />}
        error={<Typography color="error">Failed to load PDF</Typography>}
      >
        <Page pageNumber={pageNumber} />
      </Document>
      <Typography>
        Page {pageNumber} of {numPages}
      </Typography>
    </div>
  );
};

export default PDFViewer;
