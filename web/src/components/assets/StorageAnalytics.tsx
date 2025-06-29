/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Typography, Box } from "@mui/material";
import { Asset } from "../../stores/ApiTypes";
import { formatStorageUsage } from "../../utils/formatUtils";

interface StorageAnalyticsProps {
  assets: Asset[];
  currentFolder?: Asset | null;
}

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.5em 1em",
      backgroundColor: theme.palette.c_gray1,
      borderRadius: "0.25em",
      margin: "0.5em 0",
      fontSize: theme.fontSizeSmaller
    },
    ".folder-info": {
      color: theme.palette.c_gray5,
      fontWeight: 500
    },
    ".storage-stats": {
      color: theme.palette.c_hl1,
      fontSize: theme.fontSizeSmaller,
      display: "flex",
      alignItems: "center",
      gap: "1em"
    },
    ".stat-item": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    },
    ".stat-label": {
      color: theme.palette.c_gray4,
      fontSize: theme.fontSizeTiny,
      textTransform: "uppercase"
    },
    ".stat-value": {
      color: theme.palette.c_white,
      fontWeight: 600
    }
  });

const StorageAnalytics: React.FC<StorageAnalyticsProps> = ({
  assets,
  currentFolder
}) => {
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
          <span className="stat-value">
            {formatStorageUsage(totalSize, fileCount)}
          </span>
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
