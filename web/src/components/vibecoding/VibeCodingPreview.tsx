import React, { useCallback, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip, keyframes } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { ServerStatus } from "../../stores/VibeCodingStore";

const pulse = keyframes`
  0%   { opacity: 1; }
  50%  { opacity: 0.3; }
  100% { opacity: 1; }
`;

interface VibeCodingPreviewProps {
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  onRestart: () => void;
}

const VibeCodingPreview: React.FC<VibeCodingPreviewProps> = ({
  port,
  serverStatus,
  serverLogs,
  onRestart
}) => {
  const theme = useTheme();
  const blobUrlCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Status dot color
  const dotColor =
    serverStatus === "running"
      ? theme.palette.success.main
      : serverStatus === "starting"
        ? theme.palette.warning.main
        : serverStatus === "error"
          ? theme.palette.error.main
          : theme.palette.text.disabled;

  const isStarting = serverStatus === "starting";
  const isRunning = serverStatus === "running";

  const iframeUrl =
    isRunning && port != null ? `http://localhost:${port}` : null;

  // Open in new tab
  const handleOpenInNew = useCallback(() => {
    if (!iframeUrl) return;
    window.open(iframeUrl, "_blank", "noopener,noreferrer");
  }, [iframeUrl]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (blobUrlCleanupRef.current) {
        clearTimeout(blobUrlCleanupRef.current);
      }
    };
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "background.default",
        borderRadius: "8px",
        overflow: "hidden"
      }}
    >
      {/* Status bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: "background.paper"
        }}
      >
        {/* Left: dot + URL */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: dotColor,
              flexShrink: 0,
              animation: isStarting
                ? `${pulse} 1.2s ease-in-out infinite`
                : "none"
            }}
          />
          <Typography
            variant="body2"
            sx={{
              fontFamily: "fontFamily2",
              color: isRunning ? "text.primary" : "text.disabled",
              fontSize: "12px"
            }}
          >
            {isRunning && port != null
              ? `localhost:${port}`
              : serverStatus === "starting"
                ? "starting…"
                : serverStatus === "error"
                  ? "error"
                  : "stopped"}
          </Typography>
        </Box>

        {/* Right: actions */}
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Restart server">
            <IconButton size="small" onClick={onRestart}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <span>
              <IconButton
                size="small"
                onClick={handleOpenInNew}
                disabled={!isRunning || port == null}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Preview area */}
      <Box sx={{ flex: 1, position: "relative", backgroundColor: "background.paper" }}>
        {/* Iframe when running */}
        {iframeUrl && (
          <Box
            component="iframe"
            src={iframeUrl}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="VibeCoding Preview"
            sx={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block"
            }}
          />
        )}

        {/* Error logs */}
        {serverStatus === "error" && serverLogs.length > 0 && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              p: 2,
              backgroundColor: "background.default"
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: "block",
                fontFamily: "fontFamily2",
                color: "error.main",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all"
              }}
            >
              {serverLogs.join("\n")}
            </Typography>
          </Box>
        )}

        {/* Stopped / starting placeholder */}
        {!iframeUrl && serverStatus !== "error" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "text.secondary",
              textAlign: "center",
              p: 3
            }}
          >
            <Typography variant="body1" gutterBottom>
              {serverStatus === "starting"
                ? "Starting preview server…"
                : "Preview server is stopped"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {serverStatus === "starting"
                ? "Please wait a moment"
                : "Click the restart button to start the server"}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default VibeCodingPreview;
