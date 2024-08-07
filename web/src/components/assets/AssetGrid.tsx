/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box, Divider, Typography } from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";

import AudioPlayer from "../audio/AudioPlayer";
import AssetActionsMenu from "./AssetActionsMenu";
import AssetDeleteConfirmation from "./AssetDeleteConfirmation";
import AssetGridContent from "./AssetGridContent";
import AssetItemContextMenu from "../context_menus/AssetItemContextMenu";
import AssetMoveToFolderConfirmation from "./AssetMoveToFolderConfirmation";
import AssetRenameConfirmation from "./AssetRenameConfirmation";
import AssetUploadOverlay from "./AssetUploadOverlay";
import Dropzone from "./Dropzone";
import FolderList from "./FolderList";

import { useAssetDialog } from "../../hooks/assets/useAssetDialog";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import { useAssetStore } from "../../hooks/AssetStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { useNodeStore } from "../../stores/NodeStore";
import useSessionStateStore from "../../stores/SessionStateStore";
import { Asset } from "../../stores/ApiTypes";
import { useGetAssets } from "./useGetAssets";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%",
    },
    ".dropzone": {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
      maxHeight: "calc(-273px + 100vh)",
    },
    ".audio-controls-container": {
      position: "absolute",
      display: "flex",
      flexDirection: "column",
      gap: "0.25em",
      zIndex: 5000,
      bottom: "0",
      left: "0",
      width: "100%",
      padding: "0.5em",
      backgroundColor: theme.palette.c_gray1,
    },
  });

interface AssetGridProps {
  maxItemSize?: number;
  itemSpacing?: number;
  assets?: Asset[];
}

const AssetGrid: React.FC<AssetGridProps> = ({
  maxItemSize = 100,
  itemSpacing = 5,
  assets,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const { folders, otherAssets, allAssets, error } = useGetAssets(
    searchTerm,
    assets
  );

  console.log("AssetGrid - folders:", folders);
  console.log("AssetGrid - otherAssets:", otherAssets);
  console.log("AssetGrid - allAssets:", allAssets);

  const selectedAssets = useSessionStateStore((state) => state.selectedAssets);
  const { mutation: deleteMutation } = useAssetDeletion();
  const { mutation: updateMutation } = useAssetUpdate();
  const { mutation: moveMutation } = useAssetUpdate();

  const currentFolder = useAssetStore((state) => state.currentFolder);
  const currentFolderId = useAssetStore((state) => state.currentFolderId);
  const setCurrentFolderId = useAssetStore((state) => state.setCurrentFolderId);

  const F2KeyPressed = useKeyPressedStore((state) => state.isKeyPressed("F2"));
  const spaceKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed(" ")
  );

  const containerRef = useRef<HTMLDivElement>(null);

  const { uploadAsset } = useAssetUpload();

  const {
    selectedAssetIds,
    setSelectedAssetIds,
    currentAudioAsset,
    handleSelectAllAssets,
    handleDeselectAssets,
    handleSelectAsset,
  } = useAssetSelection(allAssets);

  const {
    deleteDialogOpen,
    renameDialogOpen,
    moveToFolderDialogOpen,
    openDeleteDialog,
    closeDeleteDialog,
    openRenameDialog,
    closeRenameDialog,
    openMoveToFolderDialog,
    closeMoveToFolderDialog,
  } = useAssetDialog();

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (
        !clickedElement.classList.contains("selected-asset-info") &&
        (clickedElement.classList.contains("content-type-header") ||
          clickedElement.classList.contains("selected-info") ||
          clickedElement.classList.contains("infinite-scroll-component") ||
          clickedElement.classList.contains("asset-grid-flex") ||
          clickedElement.classList.contains("divider") ||
          clickedElement.classList.contains("current-folder") ||
          clickedElement.classList.contains("asset-info") ||
          clickedElement.classList.contains("asset-grid-container") ||
          clickedElement.classList.contains("MuiTabs-flexContainer"))
      ) {
        if (selectedAssetIds.length > 0) {
          setSelectedAssetIds([]);
        }
      }
    },
    [selectedAssetIds, setSelectedAssetIds]
  );

  useEffect(() => {
    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("click", handleClickOutside);
    };
  }, [handleClickOutside]);

  useEffect(() => {
    if (F2KeyPressed && selectedAssetIds.length > 0) {
      openRenameDialog();
    }
  }, [F2KeyPressed, selectedAssetIds, openRenameDialog]);

  const uploadFiles = useCallback(
    (files: File[]) => {
      const workflow = useNodeStore.getState().workflow;
      files.forEach((file: File) => {
        uploadAsset({
          file: file,
          workflow_id: workflow.id,
          parent_id: currentFolderId || undefined,
        });
      });
    },
    [currentFolderId, uploadAsset]
  );

  const handleSearchChange = (newSearchTerm: string) => {
    console.log("Search term changed:", newSearchTerm);
    setSearchTerm(newSearchTerm);
  };

  const handleSearchClear = () => {
    console.log("Search cleared");
    setSearchTerm("");
  };

  console.log("Rendering AssetGrid");

  return (
    <Box css={styles} className="asset-grid-container" ref={containerRef}>
      {error && <Typography sx={{ color: "red" }}>{error.message}</Typography>}
      <AssetUploadOverlay />
      <AssetActionsMenu
        onSearchChange={handleSearchChange}
        onSearchClear={handleSearchClear}
        setSelectedAssetIds={setSelectedAssetIds}
        handleSelectAllAssets={handleSelectAllAssets}
        handleDeselectAssets={handleDeselectAssets}
        maxItemSize={maxItemSize}
        currentFolder={currentFolder}
        selectedAssetIds={selectedAssetIds}
        selectedAssets={selectedAssets}
      />
      <Dropzone onDrop={uploadFiles}>
        <div style={{ height: "100%" }}>
          <FolderList
            folders={folders}
            selectedAssetIds={selectedAssetIds}
            handleSelectAsset={handleSelectAsset}
            setCurrentFolderId={setCurrentFolderId}
          />

          <AssetGridContent itemSpacing={itemSpacing} assets={otherAssets} />
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
      <AssetItemContextMenu
        openDeleteDialog={openDeleteDialog}
        openRenameDialog={openRenameDialog}
        openMoveToFolderDialog={openMoveToFolderDialog}
      />
      <AssetDeleteConfirmation
        mutation={deleteMutation}
        dialogOpen={deleteDialogOpen}
        setDialogOpen={closeDeleteDialog}
        assets={selectedAssetIds}
      />
      <AssetRenameConfirmation
        mutation={updateMutation}
        dialogOpen={renameDialogOpen}
        setDialogOpen={closeRenameDialog}
        assets={selectedAssetIds}
      />
      <AssetMoveToFolderConfirmation
        mutation={moveMutation}
        dialogOpen={moveToFolderDialogOpen}
        setDialogOpen={closeMoveToFolderDialog}
        assets={selectedAssetIds}
      />
    </Box>
  );
};

export default React.memo(AssetGrid);
