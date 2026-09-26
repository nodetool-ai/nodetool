/**
 * ClipMediaOffline
 *
 * The "Media offline" badge on a timeline clip whose asset references a local
 * file in place that is missing or changed on disk. In the desktop app it
 * offers Relink: the creator picks the file's new location and the asset
 * points at it under the same id, so every clip using it comes back.
 */

import React, { memo, useCallback } from "react";

import {
  FlexRow,
  SPACING,
  StatusPill,
  UploadButton,
  Z_INDEX,
  getSpacingPx
} from "../../ui_primitives";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useRelinkAsset } from "../../../serverState/useRelinkAsset";
import {
  canResolveLocalFilePaths,
  getLocalFilePath
} from "../../../utils/localFile";
import { useAssetOffline } from "./useAssetOffline";

const stopPropagation = (e: React.SyntheticEvent): void => {
  e.stopPropagation();
};

const OfflineBadge: React.FC<{ assetId: string }> = ({ assetId }) => {
  const relink = useRelinkAsset();
  const addNotification = useNotificationStore((s) => s.addNotification);

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      const path = file ? getLocalFilePath(file) : null;
      if (!path) {
        addNotification({
          type: "error",
          content: "Could not read that file's location. Pick a file on this computer."
        });
        return;
      }
      relink.mutate(
        { id: assetId, path },
        {
          onError: (error) => {
            addNotification({
              type: "error",
              content: `Relink failed: ${error.message}`
            });
          }
        }
      );
    },
    [addNotification, assetId, relink]
  );

  return (
    <FlexRow
      gap={SPACING.xs}
      align="center"
      data-testid="clip-media-offline"
      onPointerDown={stopPropagation}
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      sx={{
        position: "absolute",
        top: getSpacingPx(SPACING.xs),
        left: getSpacingPx(SPACING.md),
        zIndex: Z_INDEX.base + 4
      }}
    >
      <StatusPill tone="failed">Media offline</StatusPill>
      {canResolveLocalFilePaths() && (
        <UploadButton
          label="Relink"
          tooltip="Relink to the file's new location"
          iconVariant="file"
          multiple={false}
          disabled={relink.isPending}
          onFileSelect={handleFiles}
        />
      )}
    </FlexRow>
  );
};

export const ClipMediaOffline: React.FC<{ assetId: string | undefined }> =
  memo(({ assetId }) => {
    const offline = useAssetOffline(assetId);
    if (!offline || !assetId) {
      return null;
    }
    return <OfflineBadge assetId={assetId} />;
  });

ClipMediaOffline.displayName = "ClipMediaOffline";
