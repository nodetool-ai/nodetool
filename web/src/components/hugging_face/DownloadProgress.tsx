/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { keyframes } from "@emotion/react";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  Typography,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// Threshold in ms to consider a download stalled (30 seconds)
const STALL_THRESHOLD_MS = 30000;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    borderRadius: "8px",
    padding: "0.75em 1em 1em",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "start",
    border: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.background.paper,
    boxShadow: theme.shadows[1],
    ".download-progress-text": {
      fontFamily: theme.fontFamily2,
      paddingBottom: "0.2em",
      width: "100%",
      marginTop: "0",
      fontSize: theme.fontSizeSmaller
    },
    ".download-status": {
      padding: "0.35em 0 0.25em",
      fontFamily: theme.fontFamily2
    },
    ".repo-name": {
      lineHeight: "1.2em",
      wordBreak: "break-word",
      paddingRight: "2.5em",
      fontWeight: 500
    },
    ".download-message": {
      fontSize: theme.fontSizeSmall,
      // Color is handled via dynamic style prop or class
    },
    ".header-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1)
    },
    ".progress-bar-container": {
      height: "8px",
      borderRadius: "4px",
      overflow: "hidden",
      position: "relative",
      background: theme.vars.palette.action.hover,
      marginTop: "0.75em"
    },
    ".progress-bar": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: `linear-gradient(90deg, ${theme.vars.palette.primary.light}, ${theme.vars.palette.primary.dark})`,
      backgroundSize: "200% 100%",
      transformOrigin: "right center"
    },
    ".download-details": {
      minHeight: "120px",
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      columnGap: theme.spacing(2),
      rowGap: theme.spacing(0.25),
      marginTop: theme.spacing(1)
    },
    ".cancel-button": {
      padding: "0.45em 0.9em",
      marginTop: ".75em",
      lineHeight: "1.1em",
      whiteSpace: "nowrap",
      alignSelf: "start"
    },
    ".meta-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      marginTop: theme.spacing(1)
    }
  });

const pulse = keyframes`
  0% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.8;
  }
`;

const moveRight = keyframes`
  0% {
    background-position: 0% 0;
  }
  100% {
    background-position: 100% 0;
  }
`;

export const DownloadProgress: React.FC<{
  name: string;
  minimal?: boolean;
}> = ({ name, minimal }) => {
  const downloads = useModelDownloadStore((state) => state.downloads);
  const cancelDownload = useModelDownloadStore((state) => state.cancelDownload);
  const removeDownload = useModelDownloadStore((state) => state.removeDownload);
  const wsConnectionState = useModelDownloadStore(
    (state) => state.wsConnectionState
  );
  const reconnectWebSocket = useModelDownloadStore(
    (state) => state.reconnectWebSocket
  );
  const download = downloads[name];
  const isDisconnected = wsConnectionState === "disconnected";
  const isReconnecting = wsConnectionState === "connecting";

  const theme = useTheme();

  // Track current time for stall detection
  const [now, setNow] = useState(Date.now());

  // Update current time every 5 seconds to check for stalls
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRemove = useCallback(() => {
    removeDownload(name);
  }, [name, removeDownload]);

  const totalBytes = download.totalBytes ?? 0;
  const downloadedBytes = download.downloadedBytes ?? 0;
  const percent =
    totalBytes > 0
      ? Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100))
      : 0;

  // Detect if download is stalled (no updates for STALL_THRESHOLD_MS or disconnected)
  const isStalled = useMemo(() => {
    const isActive =
      download.status === "running" ||
      download.status === "progress" ||
      download.status === "start";
    if (!isActive) {
      return false;
    }

    // If WebSocket is disconnected, consider it stalled
    if (isDisconnected) {
      return true;
    }

    // Check for time-based stall
    if (!download.lastUpdated) {
      return false;
    }
    return now - download.lastUpdated > STALL_THRESHOLD_MS;
  }, [download.lastUpdated, download.status, now, isDisconnected]);

  // Calculate time since last update for display
  const timeSinceUpdate = useMemo(() => {
    if (!download.lastUpdated || !isStalled) {
      return null;
    }
    const seconds = Math.floor((now - download.lastUpdated) / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }, [download.lastUpdated, isStalled, now]);

  const eta = useMemo(() => {
    if (isStalled) {
      return null;
    }
    if (download.speed && download.speed > 0) {
      const remainingBytes = totalBytes - downloadedBytes;
      const remainingSeconds = remainingBytes / download.speed;
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = Math.floor(remainingSeconds % 60);
      return `${minutes}m ${seconds}s`;
    }
    return null;
  }, [download.speed, totalBytes, downloadedBytes, isStalled]);

  // Display speed - show as stalled/disconnected if no recent updates
  const displaySpeed = useMemo(() => {
    if (isDisconnected) {
      return "Disconnected";
    }
    if (isReconnecting) {
      return "Reconnecting...";
    }
    if (isStalled) {
      return "Stalled";
    }
    if (download.speed) {
      return `${(download.speed / 1024 / 1024).toFixed(2)} MB/s`;
    }
    return "-";
  }, [download.speed, isStalled, isDisconnected, isReconnecting]);

  const showDetails =
    download.status === "start" ||
    download.status === "idle" ||
    download.status === "pending" ||
    download.status === "running" ||
    download.status === "progress";

  const getCloseButtonTooltip = () => {
    switch (download.status) {
      case "completed":
        return "Remove download from history";
      case "cancelled":
        return "Clear cancelled download";
      case "error":
        return "Clear failed download";
      default:
        return "Remove download";
    }
  };

  if (!download) {return null;}

  // Minimal inline variant for compact contexts (e.g., model variant buttons)
  if (minimal) {
    const totalBytes = download.totalBytes ?? 0;
    const downloadedBytes = download.downloadedBytes ?? 0;
    const percent =
      totalBytes > 0
        ? Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100))
        : 0;
    const label =
      download.status === "completed"
        ? "Done"
        : download.status === "error"
        ? "Error"
        : totalBytes > 0
        ? `${percent.toFixed(0)}%`
        : "…";

    const formatBytes = (bytes: number) => {
      if (!bytes || bytes < 0) {return "-";}
      const units = ["B", "KB", "MB", "GB", "TB"] as const;
      let value = bytes;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
    };

    return (
      <Tooltip
        title={`${name}: ${download.status}${
          download.message ? ` — ${download.message}` : ""
        }`}
      >
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            ml: 0.5
          }}
        >
          <CircularProgress
            size={14}
            color="inherit"
            variant={
              download.status === "completed" || totalBytes > 0
                ? "determinate"
                : "indeterminate"
            }
            value={
              download.status === "completed"
                ? 100
                : totalBytes > 0
                ? percent
                : undefined
            }
          />
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            <Typography variant="caption" sx={{ lineHeight: 1 }}>
              {label}
            </Typography>
            {totalBytes > 0 && (
              <Typography
                variant="caption"
                sx={{ lineHeight: 1, opacity: 0.8 }}
              >
                {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
              </Typography>
            )}
          </Box>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box css={styles(theme)}>
      <Box className="header-row">
        <Typography className="repo-name" variant="subtitle1">
          {name}
        </Typography>
        <Tooltip title={getCloseButtonTooltip()}>
          <IconButton onClick={handleRemove} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {download.message && (
        <Typography
          className="download-message"
          variant="body2"
          sx={{
            color:
              download.status === "error"
                ? "var(--palette-error-main)"
                : "var(--palette-info-main)"
          }}
        >
          {download.message}
        </Typography>
      )}
      {(download.status === "start" || download.status === "pending") && (
        <Box display="flex" alignItems="center">
          <CircularProgress size={20} style={{ marginRight: "0.5em" }} />
          <Typography variant="body2">
            {download.status === "start"
              ? "Starting download..."
              : "Pending download..."}
          </Typography>
        </Box>
      )}
      {download.status === "completed" && (
        <Tooltip title="Download has finished successfully">
          <Chip
            label="Completed"
            size="small"
            color="success"
            className="download-status"
          />
        </Tooltip>
      )}
      {download.status === "cancelled" && (
        <Tooltip title="Download was cancelled. You can restart it from the model browser.">
          <Chip
            label="Cancelled"
            size="small"
            color="warning"
            className="download-status"
          />
        </Tooltip>
      )}
      {download.status === "error" && (
        <Tooltip title={download.message || "Download failed"}>
          <Chip
            label="Failed"
            size="small"
            color="error"
            className="download-status"
          />
        </Tooltip>
      )}
      {showDetails && (
        <>
          <Box className="meta-row">
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {percent.toFixed(0)}%
            </Typography>
            {isStalled && (
              <Tooltip
                title={
                  isDisconnected
                    ? "WebSocket connection lost. The download may still be running on the server. Click Reconnect to restore progress updates."
                    : `No progress received for ${timeSinceUpdate}. The download may have stalled or the connection was lost. Try cancelling and restarting the download.`
                }
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    color: "var(--palette-warning-main)"
                  }}
                >
                  <WarningAmberIcon fontSize="small" />
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    {isDisconnected
                      ? "Disconnected"
                      : isReconnecting
                        ? "Reconnecting..."
                        : `Stalled (${timeSinceUpdate} since last update)`}
                  </Typography>
                  {isDisconnected && !isReconnecting && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={reconnectWebSocket}
                      sx={{
                        ml: 1,
                        minWidth: "auto",
                        padding: "2px 8px",
                        fontSize: "0.75rem"
                      }}
                    >
                      Reconnect
                    </Button>
                  )}
                </Box>
              </Tooltip>
            )}
          </Box>
          <Box className="progress-bar-container">
            <Box
              className="progress-bar"
              sx={{
                width: `${percent}%`,
                animation: isStalled
                  ? "none"
                  : `${pulse} 3s ease-in-out infinite, ${moveRight} 8s linear infinite`,
                opacity: isStalled ? 0.5 : 1,
                background: isStalled
                  ? "var(--palette-warning-main)"
                  : undefined
              }}
            />
          </Box>
          <Box className="download-details">
            <Tooltip title="Total size of files being downloaded">
              <Typography
                className="download-progress-text download-size"
                variant="body2"
                style={{
                  marginTop: ".5em",
                  fontFamily: "var(--fontFamily2)"
                }}
              >
                Size: {(download.downloadedBytes / 1024 / 1024).toFixed(2)} MB /{" "}
                {(download.totalBytes / 1024 / 1024).toFixed(2)} MB
              </Typography>
            </Tooltip>
            <Tooltip title="Number of files downloaded vs total files">
              <Typography
                className="download-progress-text download-files"
                variant="body2"
              >
                Files: {download.downloadedFiles} / {download.totalFiles}
              </Typography>
            </Tooltip>
            <Typography
              className="download-progress-text download-current"
              variant="body2"
            >
              Downloading: {download.currentFiles?.join(", ")}
            </Typography>
            <Typography
              className="download-progress-text download-speed"
              variant="body2"
              style={{
                minHeight: "1.5em",
                fontFamily: "var(--fontFamily2)",
                color: isStalled ? "var(--palette-warning-main)" : undefined
              }}
            >
              Speed: {displaySpeed}
            </Typography>
            <Typography
              className="download-progress-text download-eta"
              variant="body2"
              style={{
                minHeight: "1.2em",
                color: isStalled ? "var(--palette-warning-main)" : undefined
              }}
            >
              ETA: {isStalled ? "Unknown (stalled)" : eta || "-"}
            </Typography>
          </Box>
          <Tooltip title="Stop the current download. You can restart it later.">
            <Button
              onClick={() => cancelDownload(name)}
              variant="contained"
              style={{
                color: theme.vars.palette.primary.contrastText,
                backgroundColor: theme.vars.palette.info.main
              }}
              size="small"
              className="cancel-button"
            >
              Cancel Download
            </Button>
          </Tooltip>
        </>
      )}
    </Box>
  );
};
