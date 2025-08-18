/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { keyframes } from "@emotion/react";

import React, { useCallback, useMemo } from "react";
import {
  Typography,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    borderRadius: "4px",
    padding: ".5em",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "start",
    justifyContent: "start",
    ".download-progress-text": {
      fontFamily: theme.fontFamily2,
      paddingBottom: "0.2em",
      width: "100%",
      marginTop: "0",
      fontSize: theme.fontSizeSmaller
    },
    ".download-status": {
      padding: "1em 0",
      textTransform: "uppercase",
      fontFamily: theme.fontFamily2
    },
    ".repo-name": {
      lineHeight: "1.2em",
      wordBreak: "break-word",
      paddingRight: "1em"
    },
    ".download-message": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.info.main
    },
    ".progress-bar-container": {
      height: "6px",
      borderRadius: "3px",
      overflow: "hidden",
      position: "relative",
      background: "#555",
      marginTop: "1em"
    },
    ".progress-bar": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "linear-gradient(90deg, #3a6ba5, #5a9bd5)",
      backgroundSize: "200% 100%",
      transformOrigin: "right center"
    },
    ".download-details": {
      minHeight: "120px"
    },
    ".cancel-button": {
      padding: "0.5em 1em",
      marginTop: ".5em",
      lineHeight: "1.1em",
      whiteSpace: "nowrap",
      color: "var(--palette-grey-900)",
      backgroundColor: "var(--palette-warning-main)",
      "&:hover": {
        opacity: 0.85
      }
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
  const download = downloads[name];

  const theme = useTheme();

  const handleRemove = useCallback(() => {
    removeDownload(name);
  }, [name, removeDownload]);

  const eta = useMemo(() => {
    if (download.speed && download.speed > 0) {
      const remainingBytes = download.totalBytes - download.downloadedBytes;
      const remainingSeconds = remainingBytes / download.speed;
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = Math.floor(remainingSeconds % 60);
      return `${minutes}m ${seconds}s`;
    }
    return null;
  }, [download.speed, download.totalBytes, download.downloadedBytes]);

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

  if (!download) return null;

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
      if (!bytes || bytes < 0) return "-";
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
      <Tooltip title={getCloseButtonTooltip()}>
        <IconButton
          onClick={handleRemove}
          size="small"
          sx={{
            position: "absolute",
            top: 4,
            right: -15,
            ml: 4,
            color: "white"
          }}
          className="close-button"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Typography className="repo-name" variant="subtitle1">
        {name}
      </Typography>
      {download.message && (
        <Typography className="download-message" variant="body2">
          {download.message}
        </Typography>
      )}
      {(download.status === "start" || download.status === "pending") && (
        <Box display="flex" alignItems="center">
          <CircularProgress
            size={20}
            style={{ marginRight: "0.5em", color: "white" }}
          />
          <Typography variant="body2">
            {download.status === "start"
              ? "Starting download..."
              : "Pending download..."}
          </Typography>
        </Box>
      )}
      {download.status === "completed" && (
        <Tooltip title="Download has finished successfully">
          <Typography
            className="download-status"
            variant="body2"
            color={theme.vars.palette.success.main}
          >
            Download completed
          </Typography>
        </Tooltip>
      )}
      {download.status === "cancelled" && (
        <Tooltip title="Download was cancelled. You can restart it from the model browser.">
          <Typography
            className="download-status"
            variant="body2"
            color={theme.vars.palette.warning.main}
          >
            Download cancelled
          </Typography>
        </Tooltip>
      )}
      {download.status === "error" && (
        <Tooltip title={download.message || "Download failed"}>
          <Typography
            className="download-status"
            variant="body2"
            color={theme.vars.palette.error.main}
          >
            Download failed
          </Typography>
        </Tooltip>
      )}
      {showDetails && download.totalBytes >= 0 && (
        <>
          <Box className="progress-bar-container">
            <Box
              className="progress-bar"
              sx={{
                width: `${
                  (download.downloadedBytes / download.totalBytes) * 100
                }%`,
                animation: `${pulse} 3s ease-in-out infinite, ${moveRight} 8s linear infinite`
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
                fontFamily: "var(--fontFamily2)"
              }}
            >
              Speed:{" "}
              {download.speed
                ? `${(download.speed / 1024 / 1024).toFixed(2)} MB/s`
                : "-"}
            </Typography>
            <Typography
              className="download-progress-text download-eta"
              variant="body2"
              style={{ minHeight: "1.2em" }}
            >
              ETA: {eta || "-"}
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
