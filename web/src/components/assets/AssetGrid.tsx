/** @jsxImportSource @emotion/react */

import React, { useCallback, useEffect, useRef, useMemo, memo } from "react";
import { Box, Divider, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import AudioPlayer from "../audio/AudioPlayer";
import AssetActionsMenu from "./AssetActionsMenu";
import AssetCreateFolderConfirmation from "./AssetCreateFolderConfirmation";
import AssetDeleteConfirmation from "./AssetDeleteConfirmation";
import AssetItemContextMenu from "../context_menus/AssetItemContextMenu";
import AssetGridContextMenu from "../context_menus/AssetGridContextMenu";
import AssetMoveToFolderConfirmation from "./AssetMoveToFolderConfirmation";
import AssetRenameConfirmation from "./AssetRenameConfirmation";
import AssetUploadOverlay from "./AssetUploadOverlay";
import Dropzone from "./Dropzone";
// Extracted panels and styles
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
import { DockviewReact, DockviewReadyEvent } from "dockview";
import "dockview/dist/styles/dockview.css";

const styles = assetGridStyles;

// Panels are provided via separate components in ./panels

interface AssetGridProps {
  maxItemSize?: number;
  itemSpacing?: number;
  isHorizontal?: boolean;
  sortedAssets?: Asset[];
}

const AssetGrid: React.FC<AssetGridProps> = ({
  maxItemSize = 100,
  itemSpacing = 5,
  isHorizontal,
  sortedAssets
}) => {
  const { error, folderFilesFiltered } = useAssets();
  const openAsset = useAssetGridStore((state) => state.openAsset);
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const selectedFolderId = useAssetGridStore((state) => state.selectedFolderId);
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setRenameDialogOpen = useAssetGridStore(
    (state) => state.setRenameDialogOpen
  );
  const currentAudioAsset = useAssetGridStore(
    (state) => state.currentAudioAsset
  );
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const openMenuType = useContextMenuStore((state) => state.openMenuType);

  // Global search state
  const isGlobalSearchActive = useAssetGridStore(
    (state) => state.isGlobalSearchActive
  );
  const isGlobalSearchMode = useAssetGridStore(
    (state) => state.isGlobalSearchMode
  );
  const globalSearchResults = useAssetGridStore(
    (state) => state.globalSearchResults
  );
  const setIsGlobalSearchActive = useAssetGridStore(
    (state) => state.setIsGlobalSearchActive
  );
  const setIsGlobalSearchMode = useAssetGridStore(
    (state) => state.setIsGlobalSearchMode
  );
  const setCurrentFolderId = useAssetGridStore(
    (state) => state.setCurrentFolderId
  );
  const theme = useTheme();

  // Dockview panel components are defined below; handlers for files live inside the Files panel

  const { user } = useAuth();

  const { F2KeyPressed, spaceKeyPressed } = useKeyPressedStore((state) => ({
    F2KeyPressed: state.isKeyPressed("F2"),
    spaceKeyPressed: state.isKeyPressed(" ")
  }));

  const { uploadAsset, isUploading } = useAssetUpload();

  useClickOutsideDeselect(
    [
      "content-type-header",
      "selected-info",
      "infinite-scroll-component",
      "asset-grid-flex",
      "current-folder",
      "asset-info",
      "asset-grid-container",
      "MuiTabs-flexContainer",
      "asset-list",
      "autosizer-list",
      "asset-grid-row",
      "asset-grid-content",
      "asset-menu",
      "panel-right",
      "dropzone",
      "asset-menu-item"
    ],
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

  const panelComponents = useMemo(
    () => ({
      "asset-folders": AssetFoldersPanel,
      "asset-files": AssetFilesPanel
    }),
    []
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      api.addPanel({
        id: "asset-folders",
        component: "asset-folders",
        title: "Folders"
      });

      // In fullscreen assets view, arrange panels left/right: folders left, files right
      const isFullscreenAssets = window.location?.pathname === "/assets";
      api.addPanel({
        id: "asset-files",
        component: "asset-files",
        title: "Files",
        position: {
          referencePanel: "asset-folders",
          direction: isFullscreenAssets ? "right" : "below"
        },
        params: { isHorizontal, itemSpacing }
      });

      if (isFullscreenAssets) {
        const setFoldersWidth = () => {
          const foldersPanel: any = api.getPanel("asset-folders");
          const groupApi = foldersPanel?.group?.api ?? foldersPanel?.group;
          if (groupApi && typeof groupApi.setSize === "function") {
            groupApi.setSize({ width: 250 });
          } else if (
            foldersPanel &&
            typeof foldersPanel.setSize === "function"
          ) {
            foldersPanel.setSize({ width: 250 });
          }
        };
        // Try immediately and on next frame to ensure layout is ready
        setFoldersWidth();
        if (
          typeof window !== "undefined" &&
          "requestAnimationFrame" in window
        ) {
          window.requestAnimationFrame(() => setFoldersWidth());
        }
      }
    },
    [isHorizontal, itemSpacing]
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
      {isUploading && <AssetUploadOverlay />}
    </Box>
  );
};

export default memo(AssetGrid);
