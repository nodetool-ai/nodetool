import React from "react";
import { Box, Tooltip } from "@mui/material";
import { shallow } from "zustand/shallow";
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
  const { downloads, openDialog } = useModelDownloadStore(
    (state) => ({
      downloads: state.downloads,
      openDialog: state.openDialog
    }),
    shallow
  );

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
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          gap: "6px",
          padding: "0 4px",
          height: "32px",
          borderRadius: "6px",
          transition: "all 0.2s ease-out",
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.05)"
          }
        }}
        onClick={() => {
          openDialog();
        }}
      >
        <Box
          className="icon-container"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            "& svg": {
              width: "18px",
              height: "18px"
            }
          }}
        >
          <DownloadingIcon />
        </Box>
        {progress > 0 && (
          <Box
            className="progress-container"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              minWidth: "80px"
            }}
          >
            <Box
              className="progress-bar-container"
              sx={{
                width: "60px",
                height: "4px",
                borderRadius: "2px",
                overflow: "hidden",
                background: "var(--palette-grey-600)"
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
            <Box
              className="progress-text"
              sx={{
                fontSize: "0.7em",
                minWidth: "28px",
                textAlign: "right",
                color: "var(--palette-text-secondary)"
              }}
            >
              {progress.toFixed(0)}%
            </Box>
          </Box>
        )}
      </Box>
    </Tooltip>
  );
};

export default OverallDownloadProgress;
