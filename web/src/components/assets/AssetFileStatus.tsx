/**
 * AssetFileStatus
 *
 * The state of an asset's file, wherever the asset is shown: Missing when the
 * file is gone from where the asset expects it, Linked when the asset uses a
 * file outside the project folder in place. A missing asset offers Relink,
 * which points it at a replacement file under the same id, and Remove, which
 * deletes the asset (project folders PRD US7).
 */

import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useRelinkAsset } from "../../serverState/useRelinkAsset";
import {
  ConfirmDialog,
  EditorButton,
  FlexRow,
  SPACING,
  StatusPill,
  Tooltip,
  UploadButton
} from "../ui_primitives";
import type { Asset } from "../../stores/ApiTypes";
import {
  canResolveLocalFilePaths,
  getLocalFilePath
} from "../../utils/localFile";

type StatusAsset = Pick<Asset, "id" | "name" | "offline" | "linked">;

export interface AssetFileStatusProps {
  asset: StatusAsset;
  /** Offer Relink and Remove on a missing asset. */
  showActions?: boolean;
  /** Called after Remove deleted the asset. */
  onRemoved?: () => void;
  className?: string;
}

const stopPropagation = (event: React.SyntheticEvent): void => {
  event.stopPropagation();
};

/** Relink and Remove for a missing asset. */
const MissingAssetActions: React.FC<{
  asset: StatusAsset;
  onRemoved?: () => void;
}> = ({ asset, onRemoved }) => {
  const { t } = useTranslation("translation", {
    keyPrefix: "assetFileStatus"
  });
  const relink = useRelinkAsset();
  const { mutation: removal } = useAssetDeletion();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      const path = file ? getLocalFilePath(file) : null;
      if (!path) {
        addNotification({ type: "error", content: t("relinkNoPath") });
        return;
      }
      relink.mutate(
        { id: asset.id, path },
        {
          onError: (error) => {
            addNotification({
              type: "error",
              content: t("relinkFailed", { error: error.message })
            });
          }
        }
      );
    },
    [addNotification, asset.id, relink, t]
  );

  const openConfirm = useCallback(() => setConfirmOpen(true), []);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);
  const remove = useCallback(() => {
    // The deletion hook resets its mutation on success, which drops
    // callbacks passed to `mutate`. The promise still settles.
    removal
      .mutateAsync([asset.id])
      .then(() => onRemoved?.())
      .catch(() => {
        // The deletion hook already reported the failure.
      });
  }, [asset.id, onRemoved, removal]);

  return (
    <>
      {canResolveLocalFilePaths() && (
        <UploadButton
          label={t("relink")}
          tooltip={t("relinkTooltip")}
          iconVariant="file"
          multiple={false}
          disabled={relink.isPending}
          onFileSelect={handleFiles}
          buttonSize="small"
        />
      )}
      <EditorButton
        density="compact"
        variant="outlined"
        color="error"
        data-testid="asset-remove"
        tooltip={t("removeTooltip")}
        disabled={removal.isPending}
        onClick={openConfirm}
      >
        {t("remove")}
      </EditorButton>
      <ConfirmDialog
        open={confirmOpen}
        onClose={closeConfirm}
        onConfirm={remove}
        title={t("removeTitle", { name: asset.name })}
        content={t("removeBody")}
        confirmText={t("remove")}
        cancelText={t("cancel")}
        destructive
      />
    </>
  );
};

const AssetFileStatus: React.FC<AssetFileStatusProps> = ({
  asset,
  showActions = true,
  onRemoved,
  className
}) => {
  const { t } = useTranslation("translation", {
    keyPrefix: "assetFileStatus"
  });
  const missing = asset.offline === true;
  const linked = asset.linked === true;
  if (!missing && !linked) {
    return null;
  }

  return (
    <FlexRow
      gap={SPACING.xs}
      align="center"
      wrap
      className={className}
      data-testid="asset-file-status"
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      onPointerDown={stopPropagation}
      onKeyDown={stopPropagation}
    >
      {missing && (
        <Tooltip title={t("missingTooltip")}>
          <StatusPill tone="failed" data-testid="asset-media-missing">
            {t("missing")}
          </StatusPill>
        </Tooltip>
      )}
      {linked && (
        <Tooltip title={t("linkedTooltip")}>
          <StatusPill tone="neutral" data-testid="asset-linked">
            {t("linked")}
          </StatusPill>
        </Tooltip>
      )}
      {missing && showActions && (
        <MissingAssetActions asset={asset} onRemoved={onRemoved} />
      )}
    </FlexRow>
  );
};

export default AssetFileStatus;
