/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Divider, Typography } from "@mui/material";

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

import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { useNodeStore } from "../../stores/NodeStore";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import AssetViewer from "./AssetViewer";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAuth from "../../stores/useAuth";
import useContextMenuStore from "../../stores/ContextMenuStore";

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
  isHorizontal?: boolean;
}

const AssetGrid: React.FC<AssetGridProps> = ({
  maxItemSize = 100,
  itemSpacing = 5,
  isHorizontal,
}) => {
  const { error } = useAssets();
  const openAsset = useAssetGridStore((state) => state.openAsset);
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const selectedFolderId = useAssetGridStore((state) => state.selectedFolderId);
  const setSelectedAssetIds = useAssetGridStore((state) => state.setSelectedAssetIds);
  const setRenameDialogOpen = useAssetGridStore((state) => state.setRenameDialogOpen);
  const currentAudioAsset = useAssetGridStore((state) => state.currentAudioAsset);
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const openMenuType = useContextMenuStore((state) => state.openMenuType);
  const handleDoubleClick = (asset: Asset) => {
    setOpenAsset(asset);
  };
  const { user } = useAuth();

  const { F2KeyPressed, spaceKeyPressed } = useKeyPressedStore((state) => ({
    F2KeyPressed: state.isKeyPressed("F2"),
    spaceKeyPressed: state.isKeyPressed(" ")
  }));

  const containerRef = useRef<HTMLDivElement>(null);
  const { uploadAsset } = useAssetUpload();

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
      setRenameDialogOpen(true);
    }
  }, [F2KeyPressed, selectedAssetIds]);

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

  const { navigateToFolder } = useAssets();

  if (selectedFolderId === null) {
    if (user) {
      navigateToFolder(user?.id);
    } else {
      console.error("User is not logged in");
    }
  }
  return (
    <Box css={styles} className="asset-grid-container" ref={containerRef}>
      {error && <Typography sx={{ color: "red" }}>{error.message}</Typography>}
      <AssetUploadOverlay />
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          open={openAsset !== null}
          onClose={() => setOpenAsset(null)}
        />
      )}
      <AssetActionsMenu maxItemSize={maxItemSize} />
      <Dropzone onDrop={uploadFiles}>
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: isHorizontal ? "row" : "column",
          }}
        >
          <FolderList
            isHorizontal={isHorizontal}
          // onNavigate={navigateToFolder}
          />
          {/* <AssetGridContent itemSpacing={itemSpacing} assets={filteredAssets} /> */}
          <AssetGridContent
            itemSpacing={itemSpacing}
            onDoubleClick={handleDoubleClick}
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
      <AssetDeleteConfirmation
        assets={selectedAssetIds}
      />
      <AssetRenameConfirmation
        assets={selectedAssetIds}
      />
      <AssetMoveToFolderConfirmation
        assets={selectedAssetIds}
      />
    </Box>
  );
};

export default React.memo(AssetGrid);
