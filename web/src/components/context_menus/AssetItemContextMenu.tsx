import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo, useState, memo } from "react";
import { useNavigate } from "react-router-dom";

import { Divider, ContextMenu, ListSubheader } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CompareIcon from "@mui/icons-material/Compare";
import TabIcon from "@mui/icons-material/Tab";
import MovieEditIcon from "@mui/icons-material/Movie";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useEntityLibraryStore } from "../../stores/EntityLibraryStore";
import { assetToEntity } from "../../serverState/useEntities";
import { openPageTab } from "../workspace/openPageTab";
import { assetTabType } from "../workspace/assetTabType";
import { useEditVideoAsset } from "../../hooks/useEditVideoAsset";
import { useSetAssetFavorite } from "../../serverState/useAssetFavorite";
import { isElectron } from "../../utils/browser";
import { copyAssetToClipboard, isClipboardSupported } from "../../utils/clipboardUtils";
import AssetInfoPanel from "./AssetInfoPanel";
import { SendToWorkflowMenu } from "../workflows/SendToWorkflowMenu";
import type { WorkflowMediaItem } from "../../hooks/handlers/useGenerationToCanvas";
import { useShallow } from "zustand/react/shallow";

const AssetItemContextMenu = () => {
  const { t } = useTranslation();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore((state) => state.closeContextMenu);

  const {
    setRenameDialogOpen,
    setMoveToFolderDialogOpen,
    setDeleteDialogOpen,
    selectedAssetIds,
    selectedAssets,
    openCompareView,
    setCreateFolderDialogOpen
  } = useAssetGridStore(
    useShallow((state) => ({
      setRenameDialogOpen: state.setRenameDialogOpen,
      setMoveToFolderDialogOpen: state.setMoveToFolderDialogOpen,
      setDeleteDialogOpen: state.setDeleteDialogOpen,
      selectedAssetIds: state.selectedAssetIds,
      selectedAssets: state.selectedAssets,
      openCompareView: state.openCompareView,
      setCreateFolderDialogOpen: state.setCreateFolderDialogOpen
    }))
  );

  const download = useAssetStore((state) => state.download);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const editVideoAsset = useEditVideoAsset();

  const isFolder = selectedAssets.some(
    (asset) => asset.content_type === "folder"
  );

  // A single video opens in the timeline editor: its source timeline when one
  // exists, otherwise a fresh timeline wrapping the video.
  const singleVideo =
    selectedAssets.length === 1 &&
    selectedAssets[0]?.content_type?.startsWith("video/")
      ? selectedAssets[0]
      : null;

  const isSingleClipboardSupported =
    selectedAssets.length === 1 &&
    selectedAssets[0]?.content_type &&
    isClipboardSupported(selectedAssets[0].content_type);

  const isTwoImages =
    selectedAssets.length === 2 &&
    selectedAssets.every((asset) => asset.content_type?.startsWith("image/"));

  // Resolve the workspace tab type for a single selected asset ("Open as tab").
  // Null when nothing is openable as a tab (multi-select, folder, or a content
  // type with no document surface, e.g. video).
  const openableTabType =
    selectedAssets.length === 1 && selectedAssets[0]
      ? assetTabType(selectedAssets[0])
      : null;

  const hasSelectedAssets = selectedAssets.length > 0 && !isFolder;
  // Starring a mixed selection stars all of it; unstar only when every
  // selected asset already carries the star.
  const allFavorite =
    hasSelectedAssets && selectedAssets.every((asset) => asset.favorite);
  const setAssetFavorite = useSetAssetFavorite();

  // Images, videos, and audio can go to a workflow canvas as constant nodes.
  // A selection holding anything else offers nothing rather than a partial send.
  const workflowMedia = useMemo((): WorkflowMediaItem[] => {
    const items = selectedAssets.flatMap((asset): WorkflowMediaItem[] => {
      const kind = asset.content_type?.split("/")[0];
      return kind === "image" || kind === "video" || kind === "audio"
        ? [{ type: kind, asset_id: asset.id, title: asset.name || undefined }]
        : [];
    });
    return items.length === selectedAssets.length ? items : [];
  }, [selectedAssets]);
  // Picking "Send to workflow" swaps this menu for the workflow picker at the
  // same spot; closing the picker closes the context menu.
  const [sendingToWorkflow, setSendingToWorkflow] = useState(false);
  const closeWorkflowPicker = useCallback(() => {
    setSendingToWorkflow(false);
    closeContextMenu();
  }, [closeContextMenu]);

  const handleCopyToClipboard = useCallback(async () => {
    const asset = selectedAssets[0];
    if (!isSingleClipboardSupported || !asset?.get_url || !asset?.content_type) {
      return;
    }

    try {
      await copyAssetToClipboard(asset.content_type, asset.get_url, asset.name || undefined);

      const contentTypeLabel = asset.content_type.startsWith("image/")
        ? t("screen_editor.image")
        : asset.content_type.startsWith("video/")
        ? t("screen_editor.videoInfo")
        : asset.content_type.startsWith("audio/")
        ? t("screen_editor.audioInfo")
        : t("screen_editor.content");

      addNotification({
        type: "success",
        content: t("screen_editor.copiedToClipboard", { item: contentTypeLabel }),
        alert: true
      });
    } catch (error) {
      console.error(t("screen_editor.copyFailed"), error);
      addNotification({
        type: "error",
        content: t("screen_editor.copyFailed"),
        alert: true
      });
    }
  }, [isSingleClipboardSupported, selectedAssets, addNotification, t]);

  const handleDownloadAssets = async (selectedAssetIds: string[]) => {
    addNotification({
      type: "info",
      content: t("screen_editor.downloadStarted"),
      alert: true
    });
    try {
      await download(selectedAssetIds);
      addNotification({
        type: "success",
        content: t("screen_editor.downloadFinished"),
        alert: true
      });
    } catch (error) {
      console.error(t("screen_editor.downloadFailed"), error);
      addNotification({
        type: "error",
        content: t("screen_editor.downloadFailedDetails"),
        alert: true
      });
    }
  };

  const withMenuClose =
    (action: () => Promise<void> | void) =>
    async (event?: MouseEvent<HTMLElement>) => {
      event?.stopPropagation();
      await action();
      closeContextMenu();
    };

  const openRenameDialog = withMenuClose(() => setRenameDialogOpen(true));
  const openMoveDialog = withMenuClose(() => setMoveToFolderDialogOpen(true));
  const openCreateFolderDialog = withMenuClose(() =>
    setCreateFolderDialogOpen(true)
  );
  const openDeleteDialog = withMenuClose(() => setDeleteDialogOpen(true));
  const downloadSelected = withMenuClose(async () => {
    await handleDownloadAssets(selectedAssetIds);
  });
  const copyToClipboard = withMenuClose(async () => {
    await handleCopyToClipboard();
  });
  const handleCompareImages = withMenuClose(() => {
    if (isTwoImages) {
      openCompareView(selectedAssets[0], selectedAssets[1]);
    }
  });

  const handleOpenAsTab = withMenuClose(() => {
    const asset = selectedAssets[0];
    if (openableTabType && asset) {
      openTab({
        type: openableTabType,
        ref: asset.id,
        mode: "view",
        title: asset.name || t("screen_editor.untitled"),
        projectId: asset.project_id
      });
      navigate("/workspace");
    }
  });

  const toggleFavorite = withMenuClose(() =>
    setAssetFavorite(
      selectedAssets.map((asset) => asset.id),
      !allFavorite
    )
  );

  const handleEditVideo = withMenuClose(() => {
    if (singleVideo) {
      void editVideoAsset(singleVideo);
    }
  });

  const singleAsset =
    selectedAssets.length === 1 ? selectedAssets[0] : null;

  // A single image that is not yet an entity can start the guided "Add
  // entity" flow with itself as the reference (study-7: the Entities empty
  // state points here).
  const entityCandidate =
    singleAsset?.content_type?.startsWith("image/") &&
    !assetToEntity(singleAsset)
      ? singleAsset
      : null;

  const handleUseAsEntity = withMenuClose(() => {
    if (entityCandidate) {
      useEntityLibraryStore.getState().requestCreate(entityCandidate.id);
      openPageTab("entities");
    }
  });

  if (!menuPosition) {return null;}
  if (sendingToWorkflow) {
    return (
      <SendToWorkflowMenu
        items={workflowMedia}
        position={menuPosition}
        onClose={closeWorkflowPicker}
      />
    );
  }
  return (
    <>
      <ContextMenu
        className="context-menu asset-item-context-menu"
        open={menuPosition !== null}
        onClose={closeContextMenu}
        onContextMenu={(event) => event.preventDefault()}
        position={menuPosition}
        paperSx={singleAsset ? { display: "flex", overflow: "visible" } : undefined}
      >
        <ListSubheader className="title">
          {isFolder
            ? t("screen_editor.folder")
            : t("screen_editor.selectedItems", { count: selectedAssetIds.length })}
        </ListSubheader>
        {hasSelectedAssets && (
          <ContextMenuItem
            onClick={toggleFavorite}
            label={allFavorite ? t("screen_editor.removeFromFavorites") : t("screen_editor.addToFavorites")}
            IconComponent={allFavorite ? <StarBorderIcon /> : <StarIcon />}
            tooltip={
              allFavorite
                ? t("screen_editor.unstarSelectedAssets")
                : t("screen_editor.starSelectedAssets")
            }
          />
        )}
        <ContextMenuItem
          onClick={openRenameDialog}
          label={t("screen_editor.rename")}
          IconComponent={<DriveFileRenameOutlineIcon />}
          tooltip={t("screen_editor.renameSelectedAssets")}
        />
        {openableTabType && (
          <ContextMenuItem
            onClick={handleOpenAsTab}
            label={t("screen_editor.openAsTab")}
            IconComponent={<TabIcon />}
            tooltip={t("screen_editor.openAssetAsTabTooltip")}
          />
        )}
        {workflowMedia.length > 0 && (
          <ContextMenuItem
            onClick={(event) => {
              event?.stopPropagation();
              setSendingToWorkflow(true);
            }}
            label={t("screen_editor.sendToWorkflow")}
            IconComponent={<AccountTreeOutlinedIcon />}
            tooltip={t("screen_editor.sendMediaToWorkflowTooltip")}
          />
        )}
        {entityCandidate && (
          <ContextMenuItem
            onClick={handleUseAsEntity}
            label={t("screen_editor.useAsEntity")}
            IconComponent={<PersonAddAltOutlinedIcon />}
            tooltip={t("screen_editor.useAsEntityTooltip")}
          />
        )}
        {singleVideo && (
          <ContextMenuItem
            onClick={handleEditVideo}
            label={singleVideo.timeline_id ? t("screen_editor.editTimeline") : t("screen_editor.createTimelineFromVideo")}
            IconComponent={<MovieEditIcon />}
            tooltip={
              singleVideo.timeline_id
                ? t("screen_editor.openRenderedTimelineTooltip")
                : t("screen_editor.createTimelineTooltip")
            }
          />
        )}
        <Divider />
        <ContextMenuItem
          onClick={openMoveDialog}
          label={t("screen_editor.moveToExistingFolder")}
          IconComponent={<DriveFileMoveIcon />}
          tooltip={t("screen_editor.moveSelectedAssetsTooltip")}
        />
        <ContextMenuItem
          onClick={openCreateFolderDialog}
          label={hasSelectedAssets ? t("screen_editor.moveToNewFolder") : t("screen_editor.createFolder")}
          IconComponent={<CreateNewFolderIcon />}
          tooltip={
            hasSelectedAssets
              ? t("screen_editor.createFolderAndMoveTooltip")
              : t("screen_editor.createFolderHereTooltip")
          }
        />
        <Divider />
        <ContextMenuItem
          onClick={downloadSelected}
          label={t("screen_editor.downloadSelectedAssets")}
          IconComponent={<FileDownloadIcon />}
          tooltip={t("screen_editor.downloadSelectedAssetsTooltip")}
        />
        {isElectron && isSingleClipboardSupported && (
          <ContextMenuItem
            onClick={copyToClipboard}
            label={
              selectedAssets[0]?.content_type?.startsWith("image/")
                ? t("screen_editor.copyImage")
                : selectedAssets[0]?.content_type?.startsWith("video/")
                ? t("screen_editor.copyVideoInfo")
                : selectedAssets[0]?.content_type?.startsWith("audio/")
                ? t("screen_editor.copyAudioInfo")
                : t("screen_editor.copyContent")
            }
            IconComponent={<ContentCopyIcon />}
            tooltip={
              selectedAssets[0]?.content_type?.startsWith("image/")
                ? t("screen_editor.copyImage")
                : selectedAssets[0]?.content_type?.startsWith("video/")
                ? t("screen_editor.copyVideoMetadata")
                : selectedAssets[0]?.content_type?.startsWith("audio/")
                ? t("screen_editor.copyAudioMetadata")
                : t("screen_editor.copyContent")
            }
          />
        )}
        {isTwoImages && (
          <ContextMenuItem
            onClick={handleCompareImages}
            label={t("screen_editor.compareImages")}
            IconComponent={<CompareIcon />}
            tooltip={t("screen_editor.compareImagesTooltip")}
          />
        )}
        <Divider />
        <ContextMenuItem
          onClick={openDeleteDialog}
          label={t("screen_editor.delete")}
          destructive
          IconComponent={<RemoveCircleIcon />}
          tooltip={t("screen_editor.deleteSelectedAssets")}
        />
        {singleAsset && (
          <AssetInfoPanel
            asset={singleAsset}
            onOpenWorkflow={closeContextMenu}
          />
        )}
      </ContextMenu>
    </>
  );
};

export default memo(AssetItemContextMenu);
