/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useRef, memo } from "react";
import { Text, Tooltip, Divider, Box, Chip, FlexRow } from "../ui_primitives";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
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
import { useShallow } from "zustand/react/shallow";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useAuth from "../../stores/useAuth";
import useContextMenuStore from "../../stores/ContextMenuStore";
import {
  DockviewApi,
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  IDockviewPanel
} from "dockview";

/** IDockviewPanel exposes an internal `group` property not present in its public type */
type IDockviewPanelWithGroup = IDockviewPanel & {
  group?: { api?: { setSize: (size: { width?: number; height?: number }) => void } } & { setSize?: (size: { width?: number; height?: number }) => void };
};
import PanelErrorBoundary from "../common/PanelErrorBoundary";
import { formatFileSize } from "../../utils/formatUtils";

const panelComponents = {
  "asset-folders": (props: IDockviewPanelProps) => (
    <PanelErrorBoundary>
      <AssetFoldersPanel {...props} />
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

/** Displays count and total size of selected assets */
const SelectedItemsInfo: React.FC<{
  selectedAssetIds: string[];
  assets: Asset[];
}> = memo(({ selectedAssetIds, assets }) => {
  const totalSize = useMemo(() => {
    if (selectedAssetIds.length === 0) return 0;
    const selectedSet = new Set(selectedAssetIds);
    return assets.reduce((sum, asset) => {
      if (selectedSet.has(asset.id)) {
        return sum + (asset.size ?? 0);
      }
      return sum;
    }, 0);
  }, [selectedAssetIds, assets]);

  if (selectedAssetIds.length === 0) return null;

  return (
    <div className="header-info">
      <div className="selected-asset-info">
        <Text className="selected-info">
          {selectedAssetIds.length}{" "}
          {selectedAssetIds.length === 1 ? "item" : "items"} selected
          {totalSize > 0 && (
            <Tooltip title="Total size of selected items" disableInteractive>
              <span style={{ marginLeft: "0.5em", opacity: 0.7 }}>
                ({formatFileSize(totalSize)})
              </span>
            </Tooltip>
          )}
        </Text>
      </div>
    </div>
  );
});
SelectedItemsInfo.displayName = "SelectedItemsInfo";

interface AssetGridProps {
  maxItemSize?: number;
  itemSpacing?: number;
  isHorizontal?: boolean;
  sortedAssets?: Asset[];
  initialFoldersPanelWidth?: number;
  isFullscreenAssets?: boolean;
  isMobile?: boolean;
}

const AssetGrid: React.FC<AssetGridProps> = ({
  maxItemSize = 100,
  itemSpacing = 5,
  isHorizontal,
  sortedAssets,
  isFullscreenAssets,
  initialFoldersPanelWidth = FOLDERS_PANEL_WIDTH,
  isMobile = false
}) => {
  const { error, folderFilesFiltered, folderTree } = useAssets();
  const {
    setOpenAsset,
    setSelectedAssetIds,
    setRenameDialogOpen,
    setWorkflowFilter,
    openAsset,
    selectedAssetIds,
    selectedFolderId,
    currentAudioAsset,
    currentFolderId,
    foldersVisible,
    workflowFilter
  } = useAssetGridStore(
    useShallow((state) => ({
      setOpenAsset: state.setOpenAsset,
      setSelectedAssetIds: state.setSelectedAssetIds,
      setRenameDialogOpen: state.setRenameDialogOpen,
      setWorkflowFilter: state.setWorkflowFilter,
      openAsset: state.openAsset,
      selectedAssetIds: state.selectedAssetIds,
      selectedFolderId: state.selectedFolderId,
      currentAudioAsset: state.currentAudioAsset,
      currentFolderId: state.currentFolderId,
      foldersVisible: state.foldersVisible,
      workflowFilter: state.workflowFilter
    }))
  );
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const currentWorkflowName = useWorkflowManager((state) => {
    const id = state.currentWorkflowId;
    if (!id) return null;
    const store = state.nodeStores[id];
    return store?.getState().getWorkflow()?.name ?? null;
  });

  // Default asset scope per surface: the in-editor sidebar follows the current
  // workflow (re-asserted whenever the open workflow changes), while the
  // fullscreen page opens on the global/all-assets view. A manual pick (a
  // folder or another workflow) holds until one of these inputs changes.
  useEffect(() => {
    setWorkflowFilter(isFullscreenAssets ? null : currentWorkflowId ?? null);
  }, [isFullscreenAssets, currentWorkflowId, setWorkflowFilter]);
  const openMenuType = useContextMenuStore((state) => state.openMenuType);

  const theme = useTheme();

  // Folders are always shown in fullscreen; in the sidebar they follow the
  // user's toggle. Either way, hide the tree entirely when there are no
  // folders to show.
  const hasFolders = useMemo(
    () => !!folderTree && Object.keys(folderTree).length > 0,
    [folderTree]
  );
  const effectiveFoldersVisible =
    hasFolders && (Boolean(isFullscreenAssets) || foldersVisible);

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

  const dockviewApiRef = useRef<DockviewApi | null>(null);

  const addFoldersPanel = useCallback(
    (api: DockviewApi) => {
      const foldersPanel: IDockviewPanelWithGroup = api.addPanel({
        id: "asset-folders",
        component: "asset-folders",
        title: "Folders",
        params: { isFullscreenAssets: Boolean(isFullscreenAssets) },
        position: api.getPanel("asset-files")
          ? {
              referencePanel: "asset-files",
              direction: isFullscreenAssets ? "left" : "above"
            }
          : undefined,
        ...(isFullscreenAssets
          ? { initialWidth: initialFoldersPanelWidth }
          : { initialHeight: FOLDERS_PANEL_HEIGHT })
      });

      const groupApi = foldersPanel?.group?.api ?? foldersPanel?.group;
      if (groupApi && typeof groupApi.setSize === "function") {
        if (isFullscreenAssets) {
          groupApi.setSize({ width: initialFoldersPanelWidth });
        } else {
          groupApi.setSize({ height: FOLDERS_PANEL_HEIGHT });
        }
      }
    },
    [isFullscreenAssets, initialFoldersPanelWidth]
  );

  useEffect(() => {
    const api = dockviewApiRef.current;
    if (!api || isMobile) return;
    const existing = api.getPanel("asset-folders");
    if (effectiveFoldersVisible && !existing) {
      addFoldersPanel(api);
    } else if (!effectiveFoldersVisible && existing) {
      api.removePanel(existing);
    }
  }, [effectiveFoldersVisible, isMobile, addFoldersPanel]);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      dockviewApiRef.current = api;

      // The files panel is always present; the folders panel is added next to
      // it (and kept in sync) by addFoldersPanel / the effect above.
      api.addPanel({
        id: "asset-files",
        component: "asset-files",
        title: "Files",
        params: { isHorizontal, itemSpacing }
      });

      if (!isMobile && effectiveFoldersVisible) {
        addFoldersPanel(api);
      }
    },
    [isHorizontal, itemSpacing, isMobile, effectiveFoldersVisible, addFoldersPanel]
  );

  return (
    <Box css={styles(theme)} className="asset-grid-container">
      {error && (
        <Text
          className="error-message"
          color="error"
          sx={{
            position: "absolute",
            top: "1em",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000
          }}
        >
          {error.message}
        </Text>
      )}
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          sortedAssets={sortedAssets}
          open={openAsset !== null}
          onClose={() => setOpenAsset(null)}
        />
      )}
      {!isMobile &&
        !isFullscreenAssets &&
        currentWorkflowName &&
        workflowFilter === currentWorkflowId && (
          <FlexRow
            align="center"
            sx={{
              px: 1,
              pt: 0.5,
              pb: 0.25,
              minWidth: 0
            }}
          >
            <Tooltip
              title="This panel shows assets produced or used by the workflow you're editing. Open the global library to see all assets."
              placement="bottom-start"
              disableInteractive
            >
              <Chip
                compact
                color="primary"
                active
                icon={<AccountTreeOutlinedIcon />}
                label={currentWorkflowName}
                sx={{
                  maxWidth: "100%",
                  "& .MuiChip-label": {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }
                }}
              />
            </Tooltip>
          </FlexRow>
        )}
      {!isMobile && (
        <AssetActionsMenu
          maxItemSize={maxItemSize}
          onUploadFiles={uploadFiles}
          isFullscreenAssets={isFullscreenAssets}
        />
      )}
      {!isMobile && (
        <SelectedItemsInfo
          selectedAssetIds={selectedAssetIds}
          assets={sortedAssets || folderFilesFiltered || []}
        />
      )}
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
          barHeight={0.8}
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
