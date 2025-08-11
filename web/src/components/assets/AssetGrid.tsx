/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useEffect, useRef, useMemo, memo } from "react";
import { Box, Divider, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

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
import StorageAnalytics from "./StorageAnalytics";
import { DockviewReact, DockviewReadyEvent } from "dockview";
import "dockview/dist/styles/dockview.css";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      marginTop: "16px",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%",
      // Enable container queries based on this component's width
      containerType: "inline-size"
    },
    // Dockview: more visible resize handle just for AssetGrid
    "& .dv-split-view-container > .dv-sash-container > .dv-sash": {
      position: "relative",
      backgroundColor: theme.vars.palette.grey[700],
      transition: "background-color 0.15s ease",
      opacity: 0.95,
      boxShadow: `inset 0 0 0 1px ${theme.vars.palette.grey[900]}`,
      borderRadius: "2px"
    },
    "& .dv-split-view-container > .dv-sash-container > .dv-sash:hover": {
      backgroundColor: theme.vars.palette.primary.main
    },
    // Left/Right split (vertical sash)
    "& .dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash":
      {
        width: "10px",
        cursor: "ew-resize",
        transform: "translate(0px, 0px)"
      },
    "& .dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash::after":
      {
        content: "''",
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "2px",
        height: "60%",
        backgroundColor: theme.vars.palette.grey[300],
        borderRadius: "1px",
        opacity: 0.6
      },
    // Top/Bottom split (horizontal sash)
    "& .dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash": {
      height: "10px",
      cursor: "ns-resize",
      transform: "translate(0px, 0px)"
    },
    "& .dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash::after":
      {
        content: "''",
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "60%",
        height: "2px",
        backgroundColor: theme.vars.palette.grey[300],
        borderRadius: "1px",
        opacity: 0.6
      },
    // Hide Dockview close icons inside this AssetGrid only
    "& .dockview-container .codicon.codicon-close": {
      display: "none !important"
    },
    "& .dockview-container [class*='codicon-close']": {
      display: "none !important"
    },
    "& .dockview-container .dv-action[aria-label='Close']": {
      display: "none !important"
    },
    ".dropzone": {
      display: "flex",
      outline: "none",
      flexDirection: "column",
      position: "relative",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
      maxHeight: "calc(-260px + 100vh)"
    },
    ".audio-controls-container": {
      position: "absolute",
      width: "calc(100% - 32px)",
      left: "16px",
      bottom: "0",
      display: "flex",
      flexDirection: "column",
      gap: "0.25em",
      zIndex: 5000,
      padding: "0.5em",
      borderTop: `2px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".controls .zoom": {
      maxWidth: "200px",
      paddingBottom: "0.5em"
    },
    ".current-folder": {
      display: "block",
      left: "0",
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[200],
      margin: "1em 0 0 0"
    },
    ".folder-slash": {
      color: "var(--palette-primary-main)",
      fontWeight: 600,
      marginRight: "0.25em",
      userSelect: "none"
    },
    ".selected-asset-info": {
      fontSize: "12px !important",
      color: theme.vars.palette.grey[400],
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
      // Remove extra spacing that created large gaps between rows
      padding: 0,
      marginLeft: 0
    },
    ".folder-icon": {
      marginRight: "0.1em",
      color: "var(--c_folder)",
      verticalAlign: "middle",
      backgroundColor: "transparent"
    },
    ".folder-name": {
      fontSize: theme.fontSizeNormal,
      color: "var(--palette-grey-100)",
      verticalAlign: "middle",
      "&:hover": {
        color: theme.vars.palette.primary.main
      }
    },
    ".folder-item.selected ": {
      // Keep the color emphasis without shifting layout vertically
      padding: 0,
      margin: 0,
      width: "100%",
      backgroundColor: "transparent",
      "& .folder-name": {
        fontWeight: "600",
        color: "var(--palette-primary-main)"
      },
      "& .folder-icon": {
        color: "var(--palette-primary-main)"
      }
    },
    ".root-folder": {
      paddingLeft: "4px"
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
    },
    // Viewport-based fallback (rarely used for panel) and container query for sidebar width
    "@media (max-width: 520px)": {
      "&": {
        marginTop: "8px"
      },
      ".dropzone": {
        maxHeight: "calc(100vh - 140px)"
      },
      ".audio-controls-container": {
        left: "8px",
        width: "calc(100% - 16px)"
      }
    },
    // Container query: triggers when the asset grid itself is narrow
    "@container (max-width: 520px)": {
      ".header-info": {
        display: "none !important"
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
  const theme = useTheme();

  // Dockview panel components are defined below; handlers for files live inside the Files panel

  const { user } = useAuth();

  const { F2KeyPressed, spaceKeyPressed } = useKeyPressedStore((state) => ({
    F2KeyPressed: state.isKeyPressed("F2"),
    spaceKeyPressed: state.isKeyPressed(" ")
  }));

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

  // Dockview panels
  const FolderPanel: React.FC = () => {
    return (
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden"
        }}
      >
        <FolderList isHorizontal={false} />
      </div>
    );
  };

  const FilesPanel: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    const setOpenAssetLocal = useAssetGridStore((state) => state.setOpenAsset);
    const isGlobalSearchActiveLocal = useAssetGridStore(
      (state) => state.isGlobalSearchActive
    );
    const isGlobalSearchModeLocal = useAssetGridStore(
      (state) => state.isGlobalSearchMode
    );
    const globalSearchResultsLocal = useAssetGridStore(
      (state) => state.globalSearchResults
    );
    const setIsGlobalSearchActiveLocal = useAssetGridStore(
      (state) => state.setIsGlobalSearchActive
    );
    const setIsGlobalSearchModeLocal = useAssetGridStore(
      (state) => state.setIsGlobalSearchMode
    );
    const setCurrentFolderIdLocal = useAssetGridStore(
      (state) => state.setCurrentFolderId
    );

    const handleDoubleClick = useCallback(
      (asset: Asset) => {
        setOpenAssetLocal(asset);
      },
      [setOpenAssetLocal]
    );

    const handleGlobalSearchAssetDoubleClick = useCallback(
      (asset: AssetWithPath) => {
        setOpenAssetLocal(asset);
      },
      [setOpenAssetLocal]
    );

    const handleNavigateToFolder = useCallback(
      (folderId: string, folderPath: string) => {
        setCurrentFolderIdLocal(folderId);
        setIsGlobalSearchActiveLocal(false);
        setIsGlobalSearchModeLocal(false);
      },
      [
        setCurrentFolderIdLocal,
        setIsGlobalSearchActiveLocal,
        setIsGlobalSearchModeLocal
      ]
    );

    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <div
          className={`asset-content-wrapper ${
            isGlobalSearchModeLocal && isGlobalSearchActiveLocal
              ? "global-search-mode"
              : "normal-grid-mode"
          }`}
          style={{ height: "100%" }}
          ref={containerRef}
        >
          {isGlobalSearchModeLocal && isGlobalSearchActiveLocal ? (
            <SearchErrorBoundary fallbackTitle="Search Results Error">
              <GlobalSearchResults
                results={globalSearchResultsLocal}
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
    );
  };

  const panelComponents = useMemo(
    () => ({
      "asset-folders": FolderPanel,
      "asset-files": FilesPanel
    }),
    [FolderPanel, FilesPanel]
  );

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;
    api.addPanel({
      id: "asset-folders",
      component: "asset-folders",
      title: "Folders"
    });
    api.addPanel({
      id: "asset-files",
      component: "asset-files",
      title: "Files",
      position: { referencePanel: "asset-folders", direction: "below" }
    });
  }, []);

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
