/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useEffect, useRef, useMemo } from "react";
import useResizeObserver from "@react-hook/resize-observer";
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
import ThemeNodetool from "../themes/ThemeNodetool";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%"
    },
    ".dropzone": {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
      maxHeight: "calc(-273px + 100vh)"
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
      backgroundColor: theme.palette.c_gray1
    },
    ".current-folder": {
      minWidth: "100px",
      fontSize: ThemeNodetool.fontSizeSmall,
      color: theme.palette.c_gray5,
      padding: "0.5em 0 0 .25em"
    },
    ".folder-slash": {
      color: theme.palette.c_hl1,
      fontWeight: 600,
      marginRight: "0.25em",
      userSelect: "none"
    },
    ".selected-info": {
      fontSize: "12px !important",
      color: theme.palette.c_gray4,
      minHeight: "25px",
      display: "block"
    }
  });

interface AssetGridProps {
  maxItemSize?: number;
  itemSpacing?: number;
  isHorizontal?: boolean;
}

const AssetGrid: React.FC<AssetGridProps> = React.memo(
  ({ maxItemSize = 100, itemSpacing = 5, isHorizontal }) => {
    const { error } = useAssets();
    const openAsset = useAssetGridStore((state) => state.openAsset);
    const currentFolder = useAssetGridStore((state) => state.currentFolder);
    const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
    const selectedAssets = useAssetGridStore((state) => state.selectedAssets);

    const selectedAssetIds = useAssetGridStore(
      (state) => state.selectedAssetIds
    );
    const selectedFolderId = useAssetGridStore(
      (state) => state.selectedFolderId
    );
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
    const openMenuType = useContextMenuStore((state) => state.openMenuType);
    const handleDoubleClick = useCallback(
      (asset: Asset) => {
        setOpenAsset(asset);
      },
      [setOpenAsset]
    );

    const { user } = useAuth();

    const { F2KeyPressed, spaceKeyPressed } = useKeyPressedStore((state) => ({
      F2KeyPressed: state.isKeyPressed("F2"),
      spaceKeyPressed: state.isKeyPressed(" ")
    }));

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = React.useState(0);

    useResizeObserver(containerRef, (entry) => {
      setContainerWidth(entry.contentRect.width);
    });

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
    }, [F2KeyPressed, selectedAssetIds, setRenameDialogOpen]);

    const uploadFiles = useCallback(
      (files: File[]) => {
        const workflow = useNodeStore.getState().workflow;
        files.forEach((file: File) => {
          uploadAsset({
            file: file,
            workflow_id: workflow.id,
            parent_id: currentFolderId || undefined
          });
        });
      },
      [currentFolderId, uploadAsset]
    );

    const { navigateToFolderId } = useAssets();

    const memoizedContent = useMemo(
      () => (
        <Box css={styles} className="asset-grid-container" ref={containerRef}>
          {error && (
            <Typography sx={{ color: "red" }}>{error.message}</Typography>
          )}
          <AssetUploadOverlay />
          {openAsset && (
            <AssetViewer
              asset={openAsset}
              open={openAsset !== null}
              onClose={() => setOpenAsset(null)}
            />
          )}
          {containerWidth > 200 && (
            <AssetActionsMenu maxItemSize={maxItemSize} />
          )}
          {containerWidth > 300 && (
            <>
              <Typography className="current-folder">
                <span className="folder-slash">/</span>
                {currentFolder && `${currentFolder.name}`}
              </Typography>
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
                {selectedAssetIds.length === 1 && (
                  <Typography variant="body2" className="asset-info">
                    <span style={{ color: "white", fontSize: "small" }}>
                      {selectedAssets[0]?.name}{" "}
                    </span>
                    <br />
                    {selectedAssets[0]?.content_type}
                    <br />
                    {/* Add prettyDate function or import it */}
                    {/* {prettyDate(selectedAssets[0]?.created_at)} */}
                  </Typography>
                )}
              </div>
            </>
          )}
          <Dropzone onDrop={uploadFiles}>
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: isHorizontal ? "row" : "column"
              }}
            >
              {containerWidth > 200 && (
                <FolderList isHorizontal={isHorizontal} />
              )}
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
          {openMenuType === "asset-item-context-menu" && (
            <AssetItemContextMenu />
          )}
          <AssetDeleteConfirmation assets={selectedAssetIds} />
          <AssetRenameConfirmation assets={selectedAssetIds} />
          <AssetMoveToFolderConfirmation assets={selectedAssetIds} />
        </Box>
      ),
      [
        error,
        openAsset,
        containerWidth,
        maxItemSize,
        selectedAssetIds,
        selectedAssets,
        uploadFiles,
        isHorizontal,
        itemSpacing,
        handleDoubleClick,
        currentAudioAsset,
        spaceKeyPressed,
        openMenuType,
        setOpenAsset
      ]
    );

    if (selectedFolderId === null) {
      if (user) {
        navigateToFolderId(user?.id);
      } else {
        console.error("User is not logged in");
      }
    }

    return memoizedContent;
  }
);
AssetGrid.displayName = "AssetGrid";
export default AssetGrid;
