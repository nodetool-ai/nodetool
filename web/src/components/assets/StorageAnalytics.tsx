/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { Box, StatCard } from "../ui_primitives";
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
    }
  });

const StorageAnalytics: React.FC<StorageAnalyticsProps> = ({ assets }) => {
  const { t } = useTranslation(undefined, { keyPrefix: "i18n-next57" });
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
        <StatCard layout="plain" label={t("storage.totalSize")} value={formatFileSize(totalSize)} />

        {folderCount > 0 && (
          <StatCard layout="plain" label={t("storage.folders")} value={folderCount} />
        )}

        <StatCard layout="plain" label={t("storage.files")} value={fileCount} />
      </div>
    </Box>
  );
};

// Memoize so the summary only recomputes when the asset list identity changes.
const arePropsEqual = (prevProps: StorageAnalyticsProps, nextProps: StorageAnalyticsProps) => {
  return prevProps.assets === nextProps.assets;
};

export default memo(StorageAnalytics, arePropsEqual);
