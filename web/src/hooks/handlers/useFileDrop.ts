// useFileDrop hook: Handles file drag and drop functionality for various file types,
// with optional asset uploading

import { Asset } from "../../stores/ApiTypes";
import { DragEventHandler, useCallback, DragEvent, useState } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";

export type FileDropProps = {
  type: "image" | "audio" | "video" | "document" | "all";
  uploadAsset?: boolean;
  onChange?: (uri: string) => void;
  onChangeAsset?: (asset: Asset) => void;
};

export function useFileDrop(props: FileDropProps): {
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
  uploading: boolean;
  filename: string;
} {
  const [filename, setFilename] = useState("");
  const notificationStore = useNotificationStore();
  const { uploadAsset, isUploading } = useAssetUpload();
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.files[0]) {
        const file = event.dataTransfer.files[0];
        const items = event.dataTransfer.items;
        const isDocument =
          file.type === "application/pdf" ||
          file.type === "application/msword" ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        const fileTypeMatchesType = file?.type.startsWith(`${props.type}/`);
        const documentTypeMatchesType = isDocument && props.type === "document";

        if (
          props.type === "all" ||
          fileTypeMatchesType ||
          documentTypeMatchesType
        ) {
          setFilename(file.name);
          const reader = new FileReader();

          if (props.uploadAsset) {
            uploadAsset({
              file,
              onCompleted: (asset) => {
                if (props.onChangeAsset) {
                  props.onChangeAsset(asset);
                }
              }
            });
          } else {
            reader.onload = function (event) {
              if (event.target?.result && props.onChange) {
                props.onChange(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);
          }
        } else {
          notificationStore.addNotification({
            type: "error",
            alert: true,
            content: `Invalid file type. Please drop a ${props.type} file.`
          });
        }
        if (items && items.length > 0) {
          Array.from(items).forEach((item) => {
            item.getAsString((s) => {
              props.onChange && props.onChange(s);
            });
          });
        }

        return;
      }

      const assetJSON = event.dataTransfer.getData("asset");
      const asset = assetJSON ? (JSON.parse(assetJSON) as Asset) : null;
      if (asset?.content_type?.startsWith(`${props.type}/`)) {
        if (props.onChangeAsset) {
          props.onChangeAsset(asset);
        }
        if (props.onChange) {
          props.onChange(asset.get_url as string);
        }
      } else {
        notificationStore.addNotification({
          type: "error",
          alert: true,
          content: `Invalid file type. Please drop a ${props.type} file.`
        });
      }
    },
    [props, uploadAsset, notificationStore]
  );

  return { onDragOver, onDrop, filename, uploading: isUploading };
}
