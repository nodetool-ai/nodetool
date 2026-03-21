/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, memo } from "react";
import { Box, Divider, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import AudioPlayer from "../audio/AudioPlayer";
import AssetActionsMenu from "./AssetActionsMenu";
import AssetCreateFolderConfirmation from "./AssetCreateFolderConfirmation";
import AssetDeleteConfirmation from "./AssetDeleteConfirmation";
import AssetItemContextMenu from "../context_menus/AssetItemContextMenu";
import AssetGridContextMenu from "../context_menus/AssetGridContextMenu";
import AssetMoveToFolderConfirmation from "./AssetMoveToFolderConfirmation";
import ImageCompareDialog from "./ImageCompareDialog";
import AssetRenameConfirmation from "./AssetRenameConfirmation";
import AssetUploadOverlay from "./AssetUploadOverlay";
import Dropzone from "./Dropzone";
//  panels and styles
import AssetFoldersPanel from "./panels/AssetFoldersPanel";
import AssetFilesPanel from "./panels/AssetFilesPanel";
import assetGridStyles from "./assetGridStyles";
import useClickOutsideDeselect from "./hooks/useClickOutsideDeselect";

import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import AssetViewer from "./AssetViewer";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAuth from "../../stores/useAuth";
import useContextMenuStore from "../../stores/ContextMenuStore";
import StorageAnalytics from "./StorageAnalytics";
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  IDockviewPanel
} from "dockview";
import PanelErrorBoundary from "../common/PanelErrorBoundary";

const panelComponents = {
  "asset-folders": () => (
    <PanelErrorBoundary>
      <AssetFoldersPanel />
    </PanelErrorBoundary>
  ),
  "asset-files": (props: IDockviewPanelProps) => (
    <PanelErrorBoundary>
      <AssetFilesPanel {...props} />
    </PanelErrorBoundary>
  )
};

const styles = assetGridStyles;
const FOLDERS_PANEL_HEIGHT = 200;
const FOLDERS_PANEL_WIDTH = 200;

// Panels are provided via separate components in ./panels

interface AssetGridProps {
  maxItemSize?: number;
  itemSpacing?: number;
  isHorizontal?: boolean;
  sortedAssets?: Asset[];
  initialFoldersPanelWidth?: number;
  isFullscreenAssets?: boolean;
}

const AssetGrid: React.FC<AssetGridProps> = ({
  maxItemSize = 100,
  itemSpacing = 5,
  isHorizontal,
  sortedAssets,
  isFullscreenAssets
}) => {
  const { error, folderFilesFiltered } = useAssets();
  // Separate selectors prevent unnecessary re-renders when only one value changes
  // Setters are pulled out of selectors since they never change reference
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
  const setSelectedAssetIds = useAssetGridStore((state) => state.setSelectedAssetIds);
  const setRenameDialogOpen = useAssetGridStore((state) => state.setRenameDialogOpen);

  const openAsset = useAssetGridStore((state) => state.openAsset);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const selectedFolderId = useAssetGridStore((state) => state.selectedFolderId);
  const currentAudioAsset = useAssetGridStore((state) => state.currentAudioAsset);
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const openMenuType = useContextMenuStore((state) => state.openMenuType);

  const theme = useTheme();

  // Dockview panel components are defined below; handlers for files live inside the Files panel

  const user = useAuth((state) => state.user);

  // Separate selectors prevent unnecessary re-renders when only one key state changes
  const F2KeyPressed = useKeyPressedStore((state) => state.isKeyPressed("F2"));
  const spaceKeyPressed = useKeyPressedStore((state) => state.isKeyPressed(" "));

  const { uploadAsset, isUploading } = useAssetUpload();

  const deselectIgnoreClasses = useMemo(
    () => [
      "content-type-header",
      "selected-info",
      "infinite-scroll-component",
      "current-folder",
      "asset-info",
      "asset-grid-container",
      "asset-list",
      "autosizer-list",
      "asset-grid-row",
      "asset-grid-content",
      "asset-menu",
      "panel-right",
      "dropzone",
      "asset-menu-item"
    ],
    []
  );

  useClickOutsideDeselect(
    deselectIgnoreClasses,
    selectedAssetIds.length > 0,
    () => setSelectedAssetIds([])
  );

  useEffect(() => {
    if (F2KeyPressed && selectedAssetIds.length > 0) {
      setRenameDialogOpen(true);
    }
  }, [F2KeyPressed, selectedAssetIds, setRenameDialogOpen]);

  const uploadFiles = useCallback(
    (files: File[]) => {
      files.forEach((file: File) => {
        uploadAsset({
          file: file,
          parent_id: currentFolderId || undefined
        });
      });
    },
    [currentFolderId, uploadAsset]
  );

  const { navigateToFolderId } = useAssets();

  if (selectedFolderId === null) {
    if (user) {
      navigateToFolderId(user?.id);
    } else {
      console.error("User is not logged in");
    }
  }

  // Dockview panels are defined as top-level components (see above)

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      // Add folders panel first with an initial size
      const foldersPanel: IDockviewPanel = api.addPanel({
        id: "asset-folders",
        component: "asset-folders",
        title: "Folders",
        ...(isFullscreenAssets
          ? { initialWidth: FOLDERS_PANEL_WIDTH }
          : { initialHeight: FOLDERS_PANEL_HEIGHT })
      });

      // Add files panel positioned relative to folders
      api.addPanel({
        id: "asset-files",
        component: "asset-files",
        title: "Files",
        params: { isHorizontal, itemSpacing },
        position: {
          referencePanel: "asset-folders",
          direction: isFullscreenAssets ? "right" : "below"
        }
      });

      // Enforce initial size
      const applyInitialSize = () => {
        const groupApi =
          (foldersPanel as any)?.group?.api ?? (foldersPanel as any)?.group;
        if (groupApi && typeof groupApi.setSize === "function") {
          if (isFullscreenAssets) {
            groupApi.setSize({ width: FOLDERS_PANEL_WIDTH });
          } else {
            groupApi.setSize({ height: FOLDERS_PANEL_HEIGHT });
          }
        }
      };
      applyInitialSize();
    },
    [isFullscreenAssets, isHorizontal, itemSpacing]
  );

  return (
    <Box css={styles(theme)} className="asset-grid-container">
      {error && (
        <Typography
          className="error-message"
          sx={{
            position: "absolute",
            top: "1em",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            color: "var(--palette-error-main)"
          }}
        >
          {error.message}
        </Typography>
      )}
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          sortedAssets={sortedAssets}
          open={openAsset !== null}
          onClose={() => setOpenAsset(null)}
        />
      )}
      <AssetActionsMenu maxItemSize={maxItemSize} onUploadFiles={uploadFiles} />
      <StorageAnalytics
        assets={sortedAssets || folderFilesFiltered || []}
        currentFolder={currentFolder}
      />
      <div className="header-info">
        <div className="selected-asset-info">
          <Typography variant="body1" className="selected-info">
            {selectedAssetIds.length > 0 && (
              <>
                {selectedAssetIds.length}{" "}
                {selectedAssetIds.length === 1 ? "item " : "items "}
                selected
              </>
            )}
          </Typography>
        </div>
      </div>
      {/* Drag-and-drop enabled region; upload button now in toolbar */}
      <Dropzone onDrop={uploadFiles}>
        <div
          className="dropzone"
          style={{ height: "100%" }}
          onDragOver={(e) => {
            // Ensure dropping over Dockview children is allowed
            e.preventDefault();
          }}
        >
          <DockviewReact
            components={panelComponents}
            onReady={onReady}
            className="dockview-container"
          />
        </div>
      </Dropzone>
      <Divider />
      {currentAudioAsset && (
        <AudioPlayer
          fontSize="small"
          alwaysShowControls={true}
          source={currentAudioAsset?.get_url || ""}
          filename={currentAudioAsset?.name}
          height={30}
          waveformHeight={30}
          barHeight={1.0}
          minimapHeight={20}
          minimapBarHeight={1.0}
          waveColor="#ddd"
          progressColor="#666"
          minPxPerSec={1}
          playOnLoad={spaceKeyPressed}
        />
      )}
      {openMenuType === "asset-item-context-menu" && <AssetItemContextMenu />}
      {openMenuType === "asset-grid-context-menu" && <AssetGridContextMenu />}
      <AssetCreateFolderConfirmation />
      <AssetDeleteConfirmation assets={selectedAssetIds} />
      <AssetRenameConfirmation assets={selectedAssetIds} />
      <AssetMoveToFolderConfirmation assets={selectedAssetIds} />
      <ImageCompareDialog />
      {isUploading && <AssetUploadOverlay />}
    </Box>
  );
};

export default memo(AssetGrid);
