/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import AssetGrid from "./AssetGrid";
import StorageAnalytics from "./StorageAnalytics";
import { Box } from "../ui_primitives";
import useAssets from "../../serverState/useAssets";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";

// AssetGrid sizes itself for the narrow left panel (a top margin and a
// viewport-relative dropzone height cap). On the full-screen page those caps
// leave gaps, so override them to let the grid fill the manager content area.
const gridFillStyles = css({
  "&": {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column"
  },
  ".asset-grid-container": {
    marginTop: 0,
    flex: 1,
    minHeight: 0
  },
  ".dropzone": {
    // Override the grid's viewport-relative cap (and its mobile media-query
    // variant) so the grid fills the remaining height instead of leaving a gap.
    maxHeight: "none !important"
  }
});

/**
 * Full-screen Assets page. Reachable from the logo menu; wraps the asset grid
 * in the shared manager chrome (header + back button) so it stays consistent
 * with the Collections, Models, and Workspaces pages.
 */
const AssetExplorer: React.FC = memo(() => {
  const { folderFiles } = useAssets();

  return (
    <ManagerPageLayout
      icon={<PermMediaOutlinedIcon sx={{ fontSize: 22 }} />}
      title="Assets"
      subtitle="Browse, organize, and preview your images, audio, video, and other files."
      padded={false}
      actions={<StorageAnalytics assets={folderFiles} />}
    >
      <Box css={gridFillStyles}>
        <ContextMenuProvider>
          <AssetGrid
            maxItemSize={10}
            itemSpacing={2}
            isHorizontal={true}
            isFullscreenAssets={true}
            initialFoldersPanelWidth={300}
            sortedAssets={folderFiles}
          />
        </ContextMenuProvider>
      </Box>
    </ManagerPageLayout>
  );
});

AssetExplorer.displayName = "AssetExplorer";

export default AssetExplorer;
