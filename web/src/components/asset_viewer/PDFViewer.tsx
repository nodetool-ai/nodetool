/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Asset } from "../../stores/ApiTypes";
import {
  Typography,
  CircularProgress,
  IconButton,
  Slider
} from "@mui/material";
import { NavigateBefore, NavigateNext } from "@mui/icons-material";

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
      width: "100%",
      height: "calc(100% - 120px)",
      marginTop: "1em",
      position: "relative"
    },
    ".content-wrapper": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      overflow: "auto",
      paddingRight: "48px"
    },
    ".pdf-document": {
      width: "90%",
      backgroundColor: theme.palette.c_gray1,
      marginBottom: "1em",
      "& .react-pdf__Page": {
        marginBottom: "1em",
        display: "flex",
        justifyContent: "center",
        position: "relative",

        "& canvas": {
          position: "relative",
          zIndex: 1
        },
        "& .react-pdf__Page__annotations": {
          display: "none",
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 2
        },
        "& .textLayer": {
          display: "none",
          position: "absolute",
          right: "100px",
          color: theme.palette.c_black,
          top: 0,
          bottom: 0,
          zIndex: 3
        }
      },
      "& .react-pdf__Page__canvas": {
        maxWidth: "100%",
        height: "auto !important",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }
    },
    ".content-type": {
      marginBottom: "1em",
      color: theme.palette.text.secondary
    },
    ".page-controls": {
      position: "sticky",
      bottom: "1em",
      background: theme.palette.background.paper,
      padding: "0.8em 1em",
      borderRadius: "4px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      zIndex: 1,
      display: "flex",
      alignItems: "center",
      gap: "1em",
      minWidth: "200px"
    },
    ".vertical-slider": {
      position: "absolute",
      right: "11em",
      top: "50%",
      transform: "translateY(-50%)",
      height: "70%",
      padding: "1em 0",
      display: "flex",
      alignItems: "center",
      "& .MuiSlider-root": {
        height: "100%",
        width: ".2em",
        "& .MuiSlider-track": {
          backgroundColor: theme.palette.c_gray3
        },
        "& .MuiSlider-rail": {
          backgroundColor: theme.palette.c_gray1
        },
        "& .MuiSlider-thumb": {
          backgroundColor: theme.palette.c_gray4,
          width: "16px",
          height: "16px",
          "&:hover, &.Mui-focusVisible": {
            boxShadow: `0px 0px 0px 8px ${theme.palette.c_gray2}40`
          }
        },
        "& .MuiSlider-mark": {
          backgroundColor: theme.palette.c_gray2,
          width: "4px",
          height: "4px",
          borderRadius: "50%"
        }
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
    setPageNumber(1);
  }

  function onDocumentLoadError(error: Error) {
    setError(error);
  }

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(numPages || prev, prev + 1));
  };

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    setPageNumber(newValue as number);
  };

  return (
    <div className="pdf-viewer" css={styles}>
      <div className="content-wrapper">
        {asset?.content_type && (
          <Typography variant="body2" className="content-type">
            {asset.content_type}
          </Typography>
        )}
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
        <div className="page-controls">
          <IconButton
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            size="small"
          >
            <NavigateBefore />
          </IconButton>
          <Typography variant="body1">
            Page {pageNumber} of {numPages}
          </Typography>
          <IconButton
            onClick={goToNextPage}
            disabled={pageNumber >= (numPages || 1)}
            size="small"
          >
            <NavigateNext />
          </IconButton>
        </div>
      </div>
      <div className="vertical-slider">
        <Slider
          value={pageNumber}
          onChange={handleSliderChange}
          min={1}
          max={numPages || 1}
          step={1}
          marks
          size="small"
          orientation="vertical"
          aria-label="Page navigation slider"
        />
      </div>
    </div>
  );
};

export default PDFViewer;
