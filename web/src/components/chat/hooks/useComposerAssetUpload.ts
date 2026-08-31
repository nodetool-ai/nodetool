import { useCallback, useState } from "react";
import { DroppedFile } from "../types/chat.types";
import { assetToDroppedFile } from "./useDragAndDrop";
import useAssetUpload from "../../../serverState/useAssetUpload";
import { useNotificationStore } from "../../../stores/NotificationStore";

/**
 * Upload picked files to the asset library and hand each finished asset back
 * as a {@link DroppedFile} carrying its `asset://` reference — the same shape a
 * drag from the asset library produces, so the composer attaches a reference
 * instead of inlining the bytes.
 *
 * @param onAssetsUploaded receives each uploaded asset as it finishes, so the
 * first file appears in the composer without waiting for the rest.
 */
export const useComposerAssetUpload = (
  onAssetsUploaded: (files: DroppedFile[]) => void
) => {
  const [pending, setPending] = useState(0);
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const uploadFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      setPending((count) => count + files.length);
      const settle = () => setPending((count) => Math.max(0, count - 1));

      for (const file of files) {
        uploadAsset({
          file,
          onCompleted: (asset) => {
            settle();
            onAssetsUploaded([assetToDroppedFile(asset)]);
          },
          onFailed: (error) => {
            settle();
            addNotification({
              type: "error",
              content: `Failed to upload ${file.name}: ${error}`,
              alert: true
            });
          }
        });
      }
    },
    [uploadAsset, onAssetsUploaded, addNotification]
  );

  return { uploadFiles, isUploading: pending > 0 };
};
