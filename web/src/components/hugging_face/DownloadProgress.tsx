import React from "react";
import {
  Typography,
  Box,
  LinearProgress,
  Button,
  CircularProgress
} from "@mui/material";
import { useHuggingFaceStore } from "../../stores/HuggingFaceStore";
import { keyframes } from "@emotion/react";

const pulse = keyframes`
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
`;

export const DownloadProgress: React.FC<{ name: string }> = ({ name }) => {
  const downloads = useHuggingFaceStore((state) => state.downloads);
  const cancelDownload = useHuggingFaceStore((state) => state.cancelDownload);
  const download = downloads[name];

  if (!download) return null;

  return (
    <Box
      mt={2}
      sx={{
        border: "1px solid #999",
        borderRadius: "4px",
        padding: "16px",
        background: "#444"
      }}
    >
      <Typography variant="subtitle1">{name}</Typography>
      {download.message && (
        <Typography variant="body2">{download.message}</Typography>
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
        <Typography variant="body2" color="success">
          Download completed
        </Typography>
      )}
      {download.status === "cancelled" && (
        <Typography variant="body2" color="error">
          Download cancelled
        </Typography>
      )}
      {download.status === "error" && (
        <Typography variant="body2" color="error">
          Download error
        </Typography>
      )}
      {download.status === "progress" && (
        <>
          <LinearProgress
            variant="determinate"
            value={(download.downloadedBytes / download.totalBytes) * 100}
            sx={{
              color: "white",
              animation: `${pulse} 2s ease-in-out infinite`,
              "& .MuiLinearProgress-bar": {
                transition: "transform 0.2s linear"
              }
            }}
          />
          <Typography variant="body2" style={{ marginTop: "1em" }}>
            Size: {(download.downloadedBytes / 1024 / 1024).toFixed(2)} MB /{" "}
            {(download.totalBytes / 1024 / 1024).toFixed(2)} MB
          </Typography>
          <Typography variant="body2" style={{ marginTop: "1em" }}>
            Files: {download.downloadedFiles} / {download.totalFiles}
          </Typography>
          <Typography variant="body2" style={{ marginTop: "1em" }}>
            Current: {download.currentFile}
          </Typography>
          <Button
            onClick={() => cancelDownload(name)}
            variant="outlined"
            color="secondary"
            size="small"
            style={{ marginTop: "1em" }}
          >
            Cancel
          </Button>
        </>
      )}
    </Box>
  );
};
