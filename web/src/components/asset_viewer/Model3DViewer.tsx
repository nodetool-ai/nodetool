/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useRef, useCallback, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { Box, Typography, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import "@google/model-viewer";

// Declare model-viewer element for TypeScript
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "shadow-intensity"?: string;
          "environment-image"?: string;
          poster?: string;
          loading?: "auto" | "lazy" | "eager";
          reveal?: "auto" | "manual" | "interaction";
          ar?: boolean;
          "ar-modes"?: string;
          "touch-action"?: string;
        },
        HTMLElement
      >;
    }
  }
}

interface Model3DViewerProps {
  asset?: Asset;
  url?: string;
  compact?: boolean;
  onClick?: () => void;
}

const styles = (theme: Theme, compact: boolean) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      height: compact ? "100%" : "80%",
      marginTop: compact ? 0 : "4em",
      position: "relative"
    },
    ".model-container": {
      width: compact ? "100%" : "80%",
      height: compact ? "100%" : "70%",
      minHeight: compact ? "60px" : "300px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      cursor: compact ? "pointer" : "default"
    },
    "model-viewer": {
      width: "100%",
      height: "100%",
      backgroundColor: compact
        ? theme.vars.palette.grey[800]
        : theme.vars.palette.grey[900],
      borderRadius: compact ? "4px" : 0,
      "--progress-bar-color": theme.vars.palette.primary.main
    },
    ".loading-overlay": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px"
    },
    ".model-info": {
      marginTop: "1em",
      textAlign: "center"
    }
  });

const Model3DViewer: React.FC<Model3DViewerProps> = ({
  asset,
  url,
  compact = false,
  onClick
}) => {
  const theme = useTheme();
  const modelViewerRef = useRef<HTMLElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const modelUrl = asset?.get_url || url || "";

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setLoadError(null);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setLoadError("Failed to load 3D model");
  }, []);

  useEffect(() => {
    const viewer = modelViewerRef.current;
    if (viewer) {
      viewer.addEventListener("load", handleLoad);
      viewer.addEventListener("error", handleError);

      return () => {
        viewer.removeEventListener("load", handleLoad);
        viewer.removeEventListener("error", handleError);
      };
    }
  }, [handleLoad, handleError]);

  // Reset loading state when URL changes
  useEffect(() => {
    if (modelUrl) {
      setIsLoading(true);
      setLoadError(null);
    }
  }, [modelUrl]);

  if (!modelUrl) {
    return (
      <Box css={styles(theme, compact)} className="model-3d-viewer">
        <Typography variant="body2" color="textSecondary">
          No 3D model loaded
        </Typography>
      </Box>
    );
  }

  return (
    <Box css={styles(theme, compact)} className="model-3d-viewer">
      <div className="model-container" onClick={onClick}>
        {isLoading && !loadError && (
          <div className="loading-overlay">
            <CircularProgress size={compact ? 20 : 40} />
            {!compact && (
              <Typography variant="body2" color="textSecondary">
                Loading model...
              </Typography>
            )}
          </div>
        )}
        {loadError && (
          <div className="loading-overlay">
            <Typography variant="body2" color="error">
              {loadError}
            </Typography>
          </div>
        )}
        <model-viewer
          ref={modelViewerRef}
          src={modelUrl}
          alt={asset?.name || "3D Model"}
          camera-controls
          auto-rotate={!compact}
          shadow-intensity="1"
          touch-action="pan-y"
          loading="eager"
        />
      </div>
      {!compact && asset?.name && (
        <div className="model-info">
          <Typography variant="h6" color="textSecondary">
            {asset.name}
          </Typography>
        </div>
      )}
    </Box>
  );
};

export default Model3DViewer;
