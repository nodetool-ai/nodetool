/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useMemo, memo } from "react";
import { Box } from "../ui_primitives";
import { useLocation } from "react-router-dom";
import { Asset } from "../../stores/ApiTypes";
import { formatFileSize } from "../../utils/formatUtils";

interface StorageAnalyticsProps {
  assets: Asset[];
}

// Rendered in the manager hero's actions slot (right of the title), so it lays
// out in flow as a compact summary row instead of floating over the toolbar.
const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(3),
      fontSize: theme.fontSizeSmaller,
      whiteSpace: "nowrap"
    },
    ".storage-stats": {
      display: "flex",
      alignItems: "flex-end",
      gap: theme.spacing(3)
    },
    ".stat-item": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: theme.spacing(0.5)
    },
    ".stat-label": {
      color: theme.vars.palette.grey[400],
      fontSize: theme.fontSizeTiny,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      lineHeight: 1
    },
    ".stat-value": {
      color: theme.vars.palette.grey[0],
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.1
    }
  });

const StorageAnalytics: React.FC<StorageAnalyticsProps> = ({ assets }) => {
  const location = useLocation();
  const theme = useTheme();
  const analyticsStyles = useMemo(() => styles(theme), [theme]);

  const { totalSize, fileCount, folderCount } = useMemo(() => {
    let total = 0;
    let files = 0;
    let folders = 0;
    for (const asset of assets) {
      total += (asset.size as number | undefined) || 0;
      if (asset.content_type === "folder") {
        folders++;
      } else {
        files++;
      }
    }
    return { totalSize: total, fileCount: files, folderCount: folders };
  }, [assets]);

  // Only show in explorer mode (fullscreen asset browser)
  if (location.pathname !== "/assets") {
    return null;
  }

  if (assets.length === 0) {
    return null;
  }

  return (
    <Box css={analyticsStyles} className="storage-analytics">
      <div className="storage-stats">
        <div className="stat-item">
          <span className="stat-label">Total Size</span>
          <span className="stat-value">{formatFileSize(totalSize)}</span>
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

// Memoize so the summary only recomputes when the asset list identity changes.
const arePropsEqual = (prevProps: StorageAnalyticsProps, nextProps: StorageAnalyticsProps) => {
  return prevProps.assets === nextProps.assets;
};

export default memo(StorageAnalytics, arePropsEqual);
