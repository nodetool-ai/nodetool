import React, { useMemo, useCallback } from "react";
import { Box, Tooltip } from "@mui/material";
import { useShallow } from "zustand/react/shallow";
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
    useShallow((state) => ({
      downloads: state.downloads,
      openDialog: state.openDialog
    }))
  );

  const { progress } = useMemo(() => {
    const total = Object.values(downloads).reduce(
      (sum, download) =>
        download.status === "progress" ? sum + download.totalBytes : sum,
      0
    );
    const downloaded = Object.values(downloads).reduce(
      (sum, download) =>
        download.status === "progress" ? sum + download.downloadedBytes : sum,
      0
    );
    const prog = total > 0 ? (downloaded / total) * 100 : 0;
    return { progress: prog };
  }, [downloads]);

  const handleClick = useCallback(() => {
    openDialog();
  }, [openDialog]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDialog();
      }
    },
    [openDialog]
  );

  return (
    <Tooltip title="Download Progress" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Box
        className="overall-download-progress"
        role="button"
        tabIndex={0}
        aria-label="Download Progress"
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
          },
          "&:focus-visible": {
            outline: "2px solid var(--palette-primary-main)",
            outlineOffset: "2px"
          }
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
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
