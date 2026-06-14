import React, { memo } from "react";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import AssetGrid from "./AssetGrid";
import useAssets from "../../serverState/useAssets";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";

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
    >
      <ContextMenuProvider>
        <AssetGrid
          maxItemSize={10}
          itemSpacing={2}
          isHorizontal={true}
          isFullscreenAssets={true}
          initialFoldersPanelWidth={200}
          sortedAssets={folderFiles}
        />
      </ContextMenuProvider>
    </ManagerPageLayout>
  );
});

AssetExplorer.displayName = "AssetExplorer";

export default AssetExplorer;
