import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { keyframes } from "@emotion/react";
import ThemeNodetool from "../themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";

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

const OverallDownloadProgress: React.FC = () => {
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

  if (progress === 0) return null;

  return (
    <Tooltip title="Download Progress" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Box
        className="overall-download-progress"
        sx={{
          width: "80px",
          mt: 1,
          marginRight: "10px",
          padding: "10px 0px",
          cursor: "pointer"
        }}
        onClick={() => {
          openDialog();
        }}
      >
        <Typography
          style={{
            fontSize: "0.65em",
            padding: 0,
            lineHeight: ".6em",
            color: ThemeNodetool.palette.c_gray5
          }}
        >
          DOWNLOADING
        </Typography>
        <Box sx={{ fontSize: "0.6em", float: "left", marginRight: "10px" }}>
          {progress.toFixed(0)}%
        </Box>
        <Box
          sx={{
            height: "4px",
            borderRadius: "2px",
            overflow: "hidden",
            position: "relative",
            background: "#555",
            marginTop: "5px"
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: `${progress}%`,
              background: "linear-gradient(90deg, #3a6ba5, #5a9bd5)",
              backgroundSize: "200% 100%",
              animation: `${pulse} 3s ease-in-out infinite, ${moveRight} 8s linear infinite`,
              transformOrigin: "right center"
            }}
          />
        </Box>
      </Box>
    </Tooltip>
  );
};

export default OverallDownloadProgress;
