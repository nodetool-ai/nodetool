/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Typography, Box } from "@mui/material";
import { useLocation } from "react-router-dom";
import { Asset } from "../../stores/ApiTypes";

interface StorageAnalyticsProps {
  assets: Asset[];
  currentFolder?: Asset | null;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "absolute",
      top: "0",
      right: "0",
      minWidth: "200px",
      maxWidth: "300px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1em",
      padding: "0.5em 1em",
      backgroundColor: "transp  ",
      borderRadius: "0.25em",
      margin: "0.5em 0",
      fontSize: theme.fontSizeSmaller
    },
    ".folder-info": {
      color: theme.palette.grey[200],
      fontWeight: 500
    },
    ".storage-stats": {
      minWidth: "120px",
      color: "var(--palette-primary-main)",
      fontSize: theme.fontSizeNormal,
      display: "flex",
      alignItems: "flex-end",
      gap: "1em"
    },
    ".stat-item": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    },
    ".stat-label": {
      color: theme.palette.grey[400],
      fontSize: theme.fontSizeTiny,
      textTransform: "uppercase"
    },
    ".stat-value": {
      color: theme.palette.grey[0]
    }
  });

const StorageAnalytics: React.FC<StorageAnalyticsProps> = ({
  assets,
  currentFolder
}) => {
  const location = useLocation();

  // Only show in explorer mode (fullscreen asset browser)
  if (location.pathname !== "/assets") {
    return null;
  }

  // Calculate total storage for visible assets
  const totalSize = assets.reduce((sum, asset) => {
    const assetSize = (asset as any).size as number | undefined;
    return sum + (assetSize || 0);
  }, 0);

  const fileCount = assets.filter(
    (asset) => asset.content_type !== "folder"
  ).length;
  const folderCount = assets.filter(
    (asset) => asset.content_type === "folder"
  ).length;

  if (assets.length === 0) {
    return null;
  }

  return (
    <Box css={styles} className="storage-analytics">
      <Typography className="folder-info">
        {currentFolder?.name || "ASSETS"}
      </Typography>

      <div className="storage-stats">
        <div className="stat-item">
          <span className="stat-label">Total Size</span>
          <span className="stat-value">{totalSize}</span>
        </div>

        {folderCount > 0 && (
          <div className="stat-item">
            <span className="stat-label">Folders</span>
            <span className="stat-value">{folderCount}</span>
          </div>
        )}

        <div className="stat-item">
          <span className="stat-label">Files</span>
          <span className="stat-value">{fileCount}</span>
        </div>
      </div>
    </Box>
  );
};

export default StorageAnalytics;
