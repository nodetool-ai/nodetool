import React from "react";
import { Box, Button, Tooltip } from "@mui/material";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { keyframes } from "@emotion/react";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import DownloadingIcon from "@mui/icons-material/Downloading";

const pulse = keyframes`
  0% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.7;
  }
`;

const moveRight = keyframes`
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
`;

const OverallDownloadProgress: React.FC = () => {
  const PROGRESS_BAR_WIDTH = "160px";
  const { downloads, openDialog } = useModelDownloadStore((state) => ({
    downloads: state.downloads,
    openDialog: state.openDialog
  }));

  const totalBytes = Object.values(downloads).reduce(
    (sum, download) =>
      download.status === "progress" ? sum + download.totalBytes : sum,
    0
  );
  const downloadedBytes = Object.values(downloads).reduce(
    (sum, download) =>
      download.status === "progress" ? sum + download.downloadedBytes : sum,
    0
  );
  const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;

  return (
    <Tooltip title="Download Progress" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Box
        className="overall-download-progress"
        sx={{
          position: "relative",
          padding: "5px 0",
          cursor: "pointer",
          overflow: "visible"
        }}
        onClick={() => {
          openDialog();
        }}
      >
        <Button
          className="command-icon"
          tabIndex={-1}
          sx={{
            margin: "-2px 0 0 -2px",
            display: "flex",
            alignItems: "center",
            gap: "2px",
            "& svg": {
              width: "22px",
              height: "22px"
            }
          }}
        >
          <div
            className="icon-container"
            style={{
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <DownloadingIcon />
          </div>
        </Button>
        {progress > 0 && (
          <Box
            className="progress-container"
            sx={{
              position: "absolute",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              left: "10px",
              bottom: "-15px",
              width: PROGRESS_BAR_WIDTH
            }}
          >
            <Box className="progress-text" sx={{ fontSize: "0.6em" }}>
              {progress.toFixed(0)}%
            </Box>
            <Box
              className="progress-bar-container"
              sx={{
                width: "100%",
                height: "4px",
                borderRadius: "2px",
                overflow: "hidden",
                position: "relative",
                background: "#555",
                flex: 1
              }}
            >
              <Box
                className="progress-bar"
                sx={{
                  width: `${progress}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, var(--palette-primary-light), var(--palette-primary-dark))",
                  backgroundSize: "200% 100%",
                  animation: `${pulse} 2s ease-in-out infinite, ${moveRight} 4s linear infinite`,
                  transformOrigin: "right center"
                }}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Tooltip>
  );
};

export default OverallDownloadProgress;
