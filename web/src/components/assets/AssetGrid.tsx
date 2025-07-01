/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useEffect, useRef, useMemo, memo } from "react";
import { Box, Divider, Typography } from "@mui/material";

import AudioPlayer from "../audio/AudioPlayer";
import AssetActionsMenu from "./AssetActionsMenu";
import AssetCreateFolderConfirmation from "./AssetCreateFolderConfirmation";
import GlobalSearchResults from "./GlobalSearchResults";
import SearchErrorBoundary from "../SearchErrorBoundary";
import { AssetWithPath } from "../../stores/ApiTypes";
import AssetDeleteConfirmation from "./AssetDeleteConfirmation";
import AssetGridContent from "./AssetGridContent";
import AssetItemContextMenu from "../context_menus/AssetItemContextMenu";
import AssetGridContextMenu from "../context_menus/AssetGridContextMenu";
import AssetMoveToFolderConfirmation from "./AssetMoveToFolderConfirmation";
import AssetRenameConfirmation from "./AssetRenameConfirmation";
import AssetUploadOverlay from "./AssetUploadOverlay";
import Dropzone from "./Dropzone";
import FolderList from "./FolderList";

import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import AssetViewer from "./AssetViewer";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAuth from "../../stores/useAuth";
import useContextMenuStore from "../../stores/ContextMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import StorageAnalytics from "./StorageAnalytics";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      marginTop: "30px",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%"
    },
    ".dropzone": {
      display: "flex",
      outline: "none",
      flexDirection: "column",
      position: "relative",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
      maxHeight: "calc(-170px + 100vh)"
    },
    ".audio-controls-container": {
      position: "absolute",
      width: "calc(100% - 90px)",
      left: "80px",
      bottom: "0",
      display: "flex",
      flexDirection: "column",
      gap: "0.25em",
      zIndex: 5000,
      padding: "0.5em",
      borderTop: `2px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.c_gray1
    },
    ".controls .zoom": {
      maxWidth: "200px",
      paddingBottom: "0.5em"
    },
    ".current-folder": {
      display: "block",
      left: "0",
      fontSize: ThemeNodetool.fontSizeNormal,
      color: theme.palette.c_gray5,
      margin: "2em 0 0 0"
    },
    ".folder-slash": {
      color: theme.palette.c_hl1,
      fontWeight: 600,
      marginRight: "0.25em",
      userSelect: "none"
    },
    ".selected-asset-info": {
      fontSize: "12px !important",
      color: theme.palette.c_gray4,
      minHeight: "25px",
      padding: "0",
      margin: "0 0 0 0.5em"
    },
    ".folder-list-container": {
      padding: 0
    },
    ".folder-list": {
      listStyleType: "none",
      padding: 0,
      margin: 0
    },
    ".folder-item": {
      position: "relative",
      alignItems: "center",
      padding: "0 0 4px 0",
      marginLeft: "2em",
      "&::before, &::after": {
        content: '""',
        position: "absolute",
        left: "6px"
      },
      "&::before": {
        top: "0",
        height: "100%"
      },
      "&::after": {
        top: "12px",
        width: "12px"
      },
      "&:last-child::before": {
        height: "12px"
      }
    },
    ".folder-icon": {
      marginRight: "0.1em",
      color: "var(--c_folder)",
      verticalAlign: "middle",
      backgroundColor: "transparent"
    },
    ".folder-name": {
      fontSize: ThemeNodetool.fontSizeNormal,
      color: "var(--c_gray6)",
      verticalAlign: "middle",
      "&:hover": {
        color: theme.palette.primary.main
      }
    },
    ".folder-item.selected ": {
      padding: "0 0.5em 0 0",
      width: "calc(100% - 2em)",
      backgroundColor: "transparent",
      "& .folder-name": {
        fontWeight: "600",
        color: "var(--c_hl1)"
      },
      "& .folder-icon": {
        color: "var(--c_hl1)"
      }
    },
    ".root-folder": {
      paddingLeft: "4px",
      "&::before, &::after": {
        display: "none"
      }
    },
    ".file-info": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      "& > span": {
        textOverflow: "ellipsis",
        overflow: "hidden",
        whiteSpace: "nowrap",
        maxWidth: "200px"
      }
    }
  });

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
  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      setOpenAsset(asset);
    },
    [setOpenAsset]
  );

  const handleGlobalSearchAssetDoubleClick = useCallback(
    (asset: AssetWithPath) => {
      setOpenAsset(asset);
    },
    [setOpenAsset]
  );

  const handleNavigateToFolder = useCallback(
    (folderId: string, folderPath: string) => {
      setCurrentFolderId(folderId);
      setIsGlobalSearchActive(false);
      setIsGlobalSearchMode(false);
    },
    [setCurrentFolderId, setIsGlobalSearchActive, setIsGlobalSearchMode]
  );

  const { user } = useAuth();

  const { F2KeyPressed, spaceKeyPressed } = useKeyPressedStore((state) => ({
    F2KeyPressed: state.isKeyPressed("F2"),
    spaceKeyPressed: state.isKeyPressed(" ")
  }));

  const containerRef = useRef<HTMLDivElement>(null);
  // const [containerWidth, setContainerWidth] = React.useState(0);

  // useResizeObserver(containerRef, (entry) => {
  //   setContainerWidth(entry.contentRect.width);
  // });

  const { uploadAsset, isUploading } = useAssetUpload();

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      const deselectableClassNames = [
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
      ];

      if (
        !clickedElement.classList.contains("selected-asset-info") &&
        deselectableClassNames.some((className) =>
          clickedElement.classList.contains(className)
        )
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

  return (
    <Box css={styles} className="asset-grid-container" ref={containerRef}>
      {error && (
        <Typography
          className="error-message"
          sx={{
            position: "absolute",
            top: "1em",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            color: "var(--c_error)"
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
      <AssetActionsMenu maxItemSize={maxItemSize} />
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
      <Dropzone onDrop={uploadFiles}>
        <div
          style={{
            height: "100%",
            display: "flex",
            margin: "0.5em",
            flexDirection: isHorizontal ? "row" : "column"
          }}
        >
          <div
            className="folder-list-container"
            style={{ flexShrink: 0, position: "relative" }}
          >
            <FolderList isHorizontal={isHorizontal} />
          </div>
          <div
            style={{
              flexGrow: 1,
              minHeight: 0,
              overflow: "auto",
              paddingLeft: isHorizontal ? "1em" : ""
            }}
          >
            <div
              className={`asset-content-wrapper ${
                isGlobalSearchMode && isGlobalSearchActive
                  ? "global-search-mode"
                  : "normal-grid-mode"
              }`}
              style={{ height: "100%" }}
            >
              {isGlobalSearchMode && isGlobalSearchActive ? (
                <SearchErrorBoundary fallbackTitle="Search Results Error">
                  <GlobalSearchResults
                    results={globalSearchResults}
                    onAssetDoubleClick={handleGlobalSearchAssetDoubleClick}
                    onNavigateToFolder={handleNavigateToFolder}
                    containerWidth={containerRef.current?.offsetWidth || 800}
                  />
                </SearchErrorBoundary>
              ) : (
                <AssetGridContent
                  isHorizontal={isHorizontal}
                  itemSpacing={itemSpacing}
                  onDoubleClick={handleDoubleClick}
                />
              )}
            </div>
          </div>
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
