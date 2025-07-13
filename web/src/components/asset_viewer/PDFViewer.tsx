/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Typography,
  CircularProgress,
  IconButton,
  Slider
} from "@mui/material";
import {
  NavigateBefore,
  NavigateNext,
  ZoomIn,
  ZoomOut,
  RestartAlt
} from "@mui/icons-material";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PDFViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: Theme) =>
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
      width: "100%",
      height: "100%",
      overflow: "hidden",
      paddingRight: "50px",
      backgroundColor: "transparent"
    },
    ".pdf-document": {
      width: "calc(100% - 320px)",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      backgroundColor: "transparent",
      marginBottom: "1em",
      overflow: "auto scroll",
      "& .react-pdf__Page": {
        marginBottom: "1em",
        display: "flex",
        justifyContent: "center",
        position: "relative",
        "& canvas": {
          position: "relative",
          zIndex: 1,
          width: "auto !important",
          height: "auto !important"
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
          color: theme.palette.grey[1000],
          top: 0,
          bottom: 0,
          zIndex: 3
        }
      },
      "& .react-pdf__Page__canvas": {
        width: "auto !important",
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
      background: theme.palette.grey[600],
      padding: "0.8em 1em",
      borderRadius: "4px 4px 0 0",
      zIndex: 1,
      display: "flex",
      alignItems: "center",
      gap: "1em",
      minWidth: "200px",
      userSelect: "none"
    },
    ".zoom-controls": {
      position: "absolute",
      right: "230px",
      bottom: "75px",
      background: theme.palette.background.paper,
      padding: "0.2em",
      borderRadius: "4px",
      zIndex: 1,
      display: "flex",
      flexDirection: "row",
      gap: "0.2em"
    },
    ".vertical-slider": {
      position: "absolute",
      right: "150px",
      top: "25px",
      height: "calc(100% - 85px)",
      padding: "1em 0",
      display: "flex",
      alignItems: "center",
      "& .MuiSlider-root": {
        height: "100%",
        width: ".2em",
        "& .MuiSlider-track": {
          backgroundColor: theme.palette.grey[500]
        },
        "& .MuiSlider-rail": {
          backgroundColor: theme.palette.grey[800]
        },
        "& .MuiSlider-thumb": {
          backgroundColor: theme.palette.grey[400],
          width: "16px",
          height: "16px",
          "&:hover, &.Mui-focusVisible": {
            boxShadow: `0px 0px 0px 8px ${theme.palette.grey[600]}40`
          }
        },
        "& .MuiSlider-mark": {
          backgroundColor: theme.palette.grey[600],
          borderRadius: "0",
          width: "4px",
          height: "4px"
        }
      }
    }
  });

/**
 * PDFViewer component, used to display a PDF document for a given asset.
 */
const PDFViewer: React.FC<PDFViewerProps> = ({ asset, url }) => {
  const theme = useTheme();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [error, setError] = useState<Error | null>(null);
  const [scale, setScale] = useState(1);

  const pdfUrl = asset?.get_url || url;

  // Memoize callbacks to prevent unnecessary re-renders
  const onDocumentLoadSuccess = React.useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setPageNumber(1);
    },
    []
  );

  const onDocumentLoadError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  const goToPrevPage = React.useCallback(() => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNextPage = React.useCallback(() => {
    setPageNumber((prev) => Math.min(numPages || prev, prev + 1));
  }, [numPages]);

  const handleSliderChange = React.useCallback(
    (_event: Event, newValue: number | number[]) => {
      const actualPage = numPages ? numPages - (newValue as number) + 1 : 1;
      setPageNumber(actualPage);
    },
    [numPages]
  );

  const zoomIn = React.useCallback(() => {
    setScale((prev) => Math.min(prev + 0.2, 3));
  }, []);

  const zoomOut = React.useCallback(() => {
    setScale((prev) => Math.max(prev - 0.2, 0.2));
  }, []);

  const resetZoom = React.useCallback(() => {
    setScale(1);
  }, []);

  // Memoize the Page component to prevent unnecessary re-renders
  const pageComponent = React.useMemo(
    () => <Page pageNumber={pageNumber} scale={scale} />,
    [pageNumber, scale]
  );

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
          {pageComponent}
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
      <div className="zoom-controls">
        <IconButton onClick={zoomIn} size="small" title="Zoom in">
          <ZoomIn fontSize="small" />
        </IconButton>
        <IconButton onClick={zoomOut} size="small" title="Zoom out">
          <ZoomOut fontSize="small" />
        </IconButton>
        <IconButton onClick={resetZoom} size="small" title="Reset zoom">
          <RestartAlt fontSize="small" />
        </IconButton>
      </div>
      <div className="vertical-slider">
        <Slider
          value={numPages ? numPages - pageNumber + 1 : 1}
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
