/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import {
  Text,
  Tooltip,
  Divider,
  Box,
  AlertBanner,
  EditorButton,
  SPACING,
  getSpacingPx,
  ToolbarIconButton,
  ICON_SIZE
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import AudioPlayer from "../audio/AudioPlayer";
import AssetActionsMenu from "./AssetActionsMenu";
import AssetDeleteConfirmation from "./AssetDeleteConfirmation";
import AssetItemContextMenu from "../context_menus/AssetItemContextMenu";
import AssetGridContextMenu from "../context_menus/AssetGridContextMenu";
import ImageCompareDialog from "./ImageCompareDialog";
import AssetRenameConfirmation from "./AssetRenameConfirmation";
import TransformWithWorkflowDialog from "./TransformWithWorkflowDialog";
import AssetUploadOverlay from "./AssetUploadOverlay";
import AssetImportDialog from "./AssetImportDialog";
import Dropzone from "./Dropzone";
//  panels and styles
import AssetFilesPanel from "./panels/AssetFilesPanel";
import assetGridStyles from "./assetGridStyles";
import useClickOutsideDeselect from "./hooks/useClickOutsideDeselect";
import { useImportModeChoice } from "./hooks/useImportModeChoice";
import { useAssetGridShortcuts } from "../../hooks/assets/useAssetGridShortcuts";

import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import type { ImportMode } from "../../stores/AssetStore";
import AssetViewer from "./AssetViewer";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useShallow } from "zustand/react/shallow";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useContextMenuStore from "../../stores/ContextMenuStore";
import PanelErrorBoundary from "../common/PanelErrorBoundary";
import { formatFileSize } from "../../utils/formatUtils";
import { useOpenProjectConnection } from "../../lib/websocket/openProjectSignal";

const styles = assetGridStyles;

/** Displays count and total size of selected assets, with a clear button */
const SelectedItemsInfo: React.FC<{
  selectedAssetIds: string[];
  assets: Asset[];
  onClear: () => void;
}> = memo(({ selectedAssetIds, assets, onClear }) => {
  const { t } = useTranslation("translation", {
    keyPrefix: "i18n-next42-assets-grid"
  });
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

  // The row keeps its height while nothing is selected: selecting an asset
  // as a drag starts must not push the grid under the pointer.
  const hidden = selectedAssetIds.length === 0;

  return (
    <div
      className="header-info"
      aria-hidden={hidden}
      style={hidden ? { visibility: "hidden" } : undefined}
    >
      <div className="selected-asset-info">
        <Text className="selected-info">
          {t("selection.selected", { count: selectedAssetIds.length })}
          {totalSize > 0 && (
            <Tooltip title={t("selection.totalSize")} disableInteractive>
              <span style={{ marginLeft: getSpacingPx(SPACING.md), opacity: 0.7 }}>
                ({formatFileSize(totalSize)})
              </span>
            </Tooltip>
          )}
        </Text>
        <ToolbarIconButton
          className="clear-selection"
          icon={<CloseIcon />}
          tooltip={t("actions.clearSelection")}
          shortcut={["Esc"]}
          tooltipPlacement="top"
          onClick={onClear}
          size="small"
          sx={{ ml: SPACING.micro, "& .MuiSvgIcon-root": { fontSize: ICON_SIZE.xs } }}
        />
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
  isFullscreenAssets?: boolean;
  isMobile?: boolean;
  /**
   * Force the global (all-workflows) asset scope regardless of the currently
   * open workflow, without adopting the fullscreen page's toolbar layout.
   * Used by the "Library" sidebar panel.
   */
  forceGlobalAssets?: boolean;
}

const AssetGrid: React.FC<AssetGridProps> = ({
  maxItemSize = 100,
  itemSpacing = 5,
  isHorizontal,
  sortedAssets,
  isFullscreenAssets,
  isMobile = false,
  forceGlobalAssets = false
}) => {
  const { t } = useTranslation("translation", {
    keyPrefix: "i18n-next42-assets-grid"
  });
  // Opens the socket, so the folder is watched and the grid hears of renames.
  useOpenProjectConnection();
  const {
    error,
    folderFilesFiltered,
    projectId,
    refetchAssets
  } = useAssets();
  const {
    setOpenAsset,
    setSelectedAssetIds,
    setRenameDialogOpen,
    setWorkflowFilter,
    openAsset,
    selectedAssetIds,
    currentAudioAsset
  } = useAssetGridStore(
    useShallow((state) => ({
      setOpenAsset: state.setOpenAsset,
      setSelectedAssetIds: state.setSelectedAssetIds,
      setRenameDialogOpen: state.setRenameDialogOpen,
      setWorkflowFilter: state.setWorkflowFilter,
      openAsset: state.openAsset,
      selectedAssetIds: state.selectedAssetIds,
      currentAudioAsset: state.currentAudioAsset
    }))
  );
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  // Default asset scope per surface: the in-editor sidebar follows the current
  // workflow (re-asserted whenever the open workflow changes), while the
  // fullscreen page opens on the global/all-assets view.
  useEffect(() => {
    if (forceGlobalAssets) {
      setWorkflowFilter(null);
      return;
    }
    setWorkflowFilter(isFullscreenAssets ? null : currentWorkflowId ?? null);
  }, [isFullscreenAssets, currentWorkflowId, setWorkflowFilter, forceGlobalAssets]);
  const openMenuType = useContextMenuStore((state) => state.openMenuType);

  const theme = useTheme();

  // The fullscreen page shows the wide single-row toolbar. On a narrow
  // viewport fall back to the compact toolbar.
  const isNarrow = useMediaQuery(theme.breakpoints.down("sm"));
  const isFullscreenWide = Boolean(isFullscreenAssets) && !isNarrow;

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

  // File-manager shortcuts (select-all, delete, deselect, open) on the
  // fullscreen page, where there's no workflow canvas to collide with. The
  // list mirrors what the grid displays so Cmd+A selects the visible assets.
  const shortcutAssets = useMemo(
    () => sortedAssets ?? folderFilesFiltered ?? [],
    [sortedAssets, folderFilesFiltered]
  );
  useAssetGridShortcuts(shortcutAssets, Boolean(isFullscreenAssets));

  const startUploads = useCallback(
    (files: File[], importMode?: ImportMode) => {
      files.forEach((file: File) => {
        const upload: Parameters<typeof uploadAsset>[0] = {
          file: file,
          project_id: projectId
        };
        if (importMode) {
          upload.importMode = importMode;
        }
        uploadAsset(upload);
      });
    },
    [projectId, uploadAsset]
  );
  const importChoice = useImportModeChoice(startUploads);
  const uploadFiles = importChoice.importFiles;

  const filesPanel = (
    <PanelErrorBoundary panelName="Assets">
      <AssetFilesPanel isHorizontal={isHorizontal} itemSpacing={itemSpacing} />
    </PanelErrorBoundary>
  );

  // Stale/cached assets may still render while a refresh fails. Empty-folder
  // failures are handled inside AssetGridContent's EmptyState instead.
  const showInlineFetchError =
    error != null && (folderFilesFiltered?.length ?? 0) > 0;

  return (
    <Box css={styles(theme)} className="asset-grid-container">
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          sortedAssets={sortedAssets}
          open={openAsset !== null}
          onClose={() => setOpenAsset(null)}
        />
      )}
      {!isMobile && (
        <AssetActionsMenu
          maxItemSize={maxItemSize}
          onUploadFiles={uploadFiles}
          isFullscreenAssets={isFullscreenWide}
        />
      )}
      {showInlineFetchError && (
        <AlertBanner
          className="asset-grid-fetch-error"
          severity="error"
          compact
          title={t("states.refreshError.title")}
          sx={{
            flexShrink: 0,
            mb: getSpacingPx(SPACING.sm),
            mx: isMobile ? getSpacingPx(SPACING.md) : 0
          }}
          action={
            <EditorButton
              color="inherit"
              size="small"
              onClick={() => refetchAssets()}
            >
              {t("actions.retry")}
            </EditorButton>
          }
        >
          {error.message}
        </AlertBanner>
      )}
      {!isMobile && (
        <SelectedItemsInfo
          selectedAssetIds={selectedAssetIds}
          assets={sortedAssets || folderFilesFiltered || []}
          onClear={() => setSelectedAssetIds([])}
        />
      )}
      {/* Drag-and-drop enabled region; upload button now in toolbar */}
      <Dropzone onDrop={uploadFiles}>
        <div
          className="asset-dropzone-fill"
          style={{
            height: "100%",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            flex: 1
          }}
        >
          {filesPanel}
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
      <AssetDeleteConfirmation assets={selectedAssetIds} />
      <AssetRenameConfirmation assets={selectedAssetIds} />
      <ImageCompareDialog />
      <TransformWithWorkflowDialog />
      <AssetImportDialog
        request={importChoice.request}
        onImport={importChoice.choose}
        onCancel={importChoice.cancel}
      />
      {isUploading && <AssetUploadOverlay />}
    </Box>
  );
};

export default memo(AssetGrid);
