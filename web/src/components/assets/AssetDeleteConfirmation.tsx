import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import InsertDriveFile from "@mui/icons-material/InsertDriveFile";
import { useQueryClient } from "@tanstack/react-query";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  Dialog,
  FlexColumn,
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
  const dialogOpen = useAssetGridStore((state) => state.deleteDialogOpen);
  const setDialogOpen = useAssetGridStore((state) => state.setDeleteDialogOpen);
  const { mutation } = useAssetDeletion();
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  // The library lists files only: directories are managed in the Files panel.
  const fileAssets = useMemo(
    () => selectedAssets.filter((asset) => asset.content_type !== "folder"),
    [selectedAssets]
  );
  const fileCount = fileAssets.length;

  const handleClose = useCallback(() => {
    // Blur focused element to prevent aria-hidden focus warning
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setDialogOpen(false);
  }, [setDialogOpen]);

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
      addNotification({
        type: "success",
        alert: true,
        content: t("assetDelete.deleted", {
          items:
            fileCount > 0
              ? t(fileCount === 1 ? "assetDelete.fileOne" : "assetDelete.fileOther", { count: fileCount })
              : t("assetDelete.selection")
        })
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
    queryClient,
    addNotification,
    fileCount,
    t
  ]);

  const itemCount = fileCount || assets.length;

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
    >
      <FlexColumn
        className="asset-delete-confirmation-content"
        gap={SPACING.xl}
      >
        <Text color="secondary">
          {t("assetDelete.downloadBeforeDelete")}
        </Text>
        <ListGroup compact flush>
          {fileAssets.map((file) => (
            <ListItemRow
              key={file.id}
              primary={file.name}
              icon={<InsertDriveFile />}
            />
          ))}
        </ListGroup>
      </FlexColumn>
    </Dialog>
  );
};

export default AssetDeleteConfirmation;
