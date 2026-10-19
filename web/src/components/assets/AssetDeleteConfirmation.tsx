import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import InsertDriveFile from "@mui/icons-material/InsertDriveFile";
import { useQueryClient } from "@tanstack/react-query";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useAssets } from "../../serverState/useAssets";
import AssetTree from "./AssetTree";
import { Asset } from "../../stores/ApiTypes";
import { useAuth } from "../../stores/useAuth";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  AlertBanner,
  Dialog,
  FlexColumn,
  LoadingSpinner,
  ListGroup,
  ListItemRow,
  SPACING,
  Text
} from "../ui_primitives";
import { isObjectLike } from "../../utils/typePredicates";

interface AssetDeleteConfirmationProps {
  assets: string[];
}

const AssetDeleteConfirmation: React.FC<AssetDeleteConfirmationProps> = ({
  assets
}) => {
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next27" });
  const [isLoading, setIsLoading] = useState(false);
  const [totalAssets, setTotalAssets] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [fileAssets, setFileAssets] = useState<Asset[]>([]);
  const [isAssetTreeLoading, setIsAssetTreeLoading] = useState(true);
  const [isPreparingDelete, setIsPreparingDelete] = useState(true);
  const [showRootFolderWarning, setShowRootFolderWarning] = useState(false);
  const dialogOpen = useAssetGridStore((state) => state.deleteDialogOpen);
  const setDialogOpen = useAssetGridStore((state) => state.setDeleteDialogOpen);
  const { mutation } = useAssetDeletion();
  const { refetchAssetsAndFolders } = useAssets();
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const user = useAuth((state) => state.user);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  useEffect(() => {
    if (!dialogOpen) {
      return;
    } // Only process when dialog is actually open

    const countAssetTypes = () => {
      setIsPreparingDelete(true);
      let folders = 0;
      let files = 0;
      const fileAssetsTemp: Asset[] = [];
      setTotalAssets(0);
      let hasRootFolder = false;

      for (const asset of selectedAssets) {
        if (asset.content_type === "folder") {
          folders++;
          if (asset.id === "1" || (user && asset.id === user.id)) {
            hasRootFolder = true;
          }
        } else {
          files++;
          fileAssetsTemp.push(asset);
        }
      }

      setFolderCount(folders);
      setFileCount(files);
      setFileAssets(fileAssetsTemp);
      if (folders === 0) {
        setIsAssetTreeLoading(false);
      }
      if (files > 0 && folders === 0) {
        setTotalAssets(files);
      }
      setIsPreparingDelete(false);
      setShowRootFolderWarning(hasRootFolder);
    };

    countAssetTypes();
  }, [dialogOpen, selectedAssets, user]);

  const handleClose = useCallback(() => {
    // Blur focused element to prevent aria-hidden focus warning
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setDialogOpen(false);
  }, [setDialogOpen]);

  const handleTotalAssetsCalculated = useCallback((assetCount: number) => {
    setTotalAssets(assetCount);
  }, []);

  const executeDeletion = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await mutation.mutateAsync(assets);
      if (response === undefined) {
        console.error("Received undefined response from server");
      } else if (isObjectLike(response)) {
        console.info(
          "Deleted asset IDs:",
          (response as { deleted_asset_ids?: string[] }).deleted_asset_ids
        );
      }
      // Blur focused element to prevent aria-hidden focus warning
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setDialogOpen(false);
      // Invalidate all asset queries (including workflow-specific ones)
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      await refetchAssetsAndFolders();
      const parts = [
        folderCount > 0
          ? t(folderCount === 1 ? "assetDelete.folderOne" : "assetDelete.folderOther", { count: folderCount })
          : null,
        fileCount > 0 ? t(fileCount === 1 ? "assetDelete.fileOne" : "assetDelete.fileOther", { count: fileCount }) : null
      ].filter((part): part is string => part !== null);
      addNotification({
        type: "success",
        alert: true,
        content: t("assetDelete.deleted", { items: parts.join(" and ") || t("assetDelete.selection") })
      });
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: t("assetDelete.failed", { error: error instanceof Error ? error.message : t("assetDelete.unknownError") })
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    mutation,
    assets,
    setDialogOpen,
    refetchAssetsAndFolders,
    queryClient,
    addNotification,
    folderCount,
    fileCount
  ]);

  const itemCount = folderCount + fileCount || assets.length;
  const plural = (count: number, word: string) =>
    t(count === 1 ? `assetDelete.${word}One` : `assetDelete.${word}Other`, { count });
  const folderSummary =
    folderCount === 0 || isAssetTreeLoading
      ? null
      : folderCount === 1 && fileCount === 0
        ? t("assetDelete.folderContains", { files: t((totalAssets - 1) === 1 ? "assetDelete.fileOne" : "assetDelete.fileOther", { count: totalAssets - 1 }) })
        : t("assetDelete.folderSummary", { folders: plural(folderCount, "folder"), files: plural(fileCount, "file"), items: plural(totalAssets, "item") });

  return (
    <Dialog
      className="asset-delete-confirmation"
      open={dialogOpen}
      onClose={handleClose}
      disableRestoreFocus
      maxWidth="sm"
      fullWidth
      title={t(itemCount === 1 ? "assetDelete.titleOne" : "assetDelete.titleOther", { count: itemCount })}
      onConfirm={executeDeletion}
      confirmText={t("assetDelete.delete")}
      destructive
      isLoading={isLoading}
      confirmDisabled={isAssetTreeLoading || showRootFolderWarning}
    >
      <FlexColumn
        className="asset-delete-confirmation-content"
        gap={SPACING.xl}
      >
        {showRootFolderWarning ? (
          <AlertBanner severity="warning">
            {t("assetDelete.rootFolderWarning")}
          </AlertBanner>
        ) : null}
        <Text color="secondary">
          {t("assetDelete.downloadBeforeDelete")}
        </Text>
        {folderSummary && !showRootFolderWarning ? (
          <Text>{folderSummary}</Text>
        ) : null}
        {isPreparingDelete ? (
          <LoadingSpinner size="small" />
        ) : (
          <>
            {!showRootFolderWarning && (
              <>
                {folderCount > 0 ? (
                  assets.map((assetId) => (
                    <AssetTree
                      key={assetId}
                      folderId={assetId}
                      onTotalAssetsCalculated={handleTotalAssetsCalculated}
                      onLoading={setIsAssetTreeLoading}
                    />
                  ))
                ) : (
                  <ListGroup compact flush>
                    {fileAssets.map((file) => (
                      <ListItemRow
                        key={file.id}
                        primary={file.name}
                        icon={<InsertDriveFile />}
                      />
                    ))}
                  </ListGroup>
                )}
              </>
            )}
          </>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default AssetDeleteConfirmation;
