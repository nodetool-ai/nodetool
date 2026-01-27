/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CodeIcon from "@mui/icons-material/Code";
import { BASE_URL, UNIFIED_WS_URL } from "../../stores/BASE_URL";
import { injectRuntimeConfig } from "./utils/extractHtml";
import type { Theme } from "@mui/material/styles";

const createStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.default,
      borderRadius: "8px",
      overflow: "hidden"
    },
    ".preview-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper
    },
    ".preview-title": {
      fontSize: "14px",
      fontWeight: 500,
      color: theme.palette.text.primary
    },
    ".preview-actions": {
      display: "flex",
      gap: "4px"
    },
    ".preview-frame-container": {
      flex: 1,
      position: "relative",
      backgroundColor: "#ffffff"
    },
    ".preview-frame": {
      width: "100%",
      height: "100%",
      border: "none"
    },
    ".preview-empty": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.palette.text.secondary,
      textAlign: "center",
      padding: "24px"
    },
    ".preview-empty-icon": {
      fontSize: "48px",
      marginBottom: "16px",
      opacity: 0.5
    },
    ".preview-loading": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)"
    }
  });

interface VibeCodingPreviewProps {
  html: string | null;
  workflowId: string;
  isGenerating?: boolean;
  onViewSource?: () => void;
}

const VibeCodingPreview: React.FC<VibeCodingPreviewProps> = ({
  html,
  workflowId,
  isGenerating = false,
  onViewSource
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Inject runtime configuration into HTML
  const processedHtml = useMemo(() => {
    if (!html) {
      return null;
    }

    return injectRuntimeConfig(html, {
      apiUrl: BASE_URL,
      wsUrl: UNIFIED_WS_URL,
      workflowId
    });
  }, [html, workflowId]);

  // Force iframe refresh
  const handleRefresh = useCallback(() => {
    setIframeKey((prev) => prev + 1);
  }, []);

  // Open in new tab
  const handleOpenInNew = useCallback(() => {
    if (!processedHtml) {
      return;
    }

    const blob = new Blob([processedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");

    // Clean up blob URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [processedHtml]);

  return (
    <Box css={styles}>
      <div className="preview-header">
        <Typography className="preview-title">
          Preview
          {isGenerating && " (Generating...)"}
        </Typography>
        <div className="preview-actions">
          {onViewSource && (
            <Tooltip title="View Source">
              <IconButton size="small" onClick={onViewSource}>
                <CodeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Refresh Preview">
            <IconButton size="small" onClick={handleRefresh} disabled={!html}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in New Tab">
            <IconButton size="small" onClick={handleOpenInNew} disabled={!html}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <div className="preview-frame-container">
        {isGenerating && !html && (
          <div className="preview-loading">
            <CircularProgress size={32} />
          </div>
        )}

        {!html && !isGenerating && (
          <div className="preview-empty">
            <CodeIcon className="preview-empty-icon" />
            <Typography variant="body1" gutterBottom>
              No preview available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Describe your desired UI in the chat to generate a custom app
            </Typography>
          </div>
        )}

        {processedHtml && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            className="preview-frame"
            srcDoc={processedHtml}
            // allow-same-origin is required for localStorage/sessionStorage and
            // proper functioning of injected runtime config (API/WS URLs)
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
            title="VibeCoding Preview"
          />
        )}
      </div>
    </Box>
  );
};

export default VibeCodingPreview;
