/**
 * Hook for handling file drag-and-drop functionality with optional asset uploading.
 * 
 * This hook provides drag-and-drop handlers for dropping files onto components,
 * with support for various file types and optional automatic asset uploading.
 */

import { Asset } from "../../stores/ApiTypes";
import { DragEventHandler, useCallback, DragEvent, useState } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../../lib/dragdrop";

/**
 * Configuration options for file drop handling.
 */
export type FileDropProps = {
  /** The type of files to accept: image, audio, video, document, or all */
  type: "image" | "audio" | "video" | "document" | "all";
  /** Whether to upload dropped files as assets to the server */
  uploadAsset?: boolean;
  /** Callback fired when a file is dropped and processed (returns URI) */
  onChange?: (uri: string) => void;
  /** Callback fired when a file is dropped and uploaded as an asset (returns Asset) */
  onChangeAsset?: (asset: Asset) => void;
};

/**
 * Result object containing drag-and-drop handlers and upload state.
 */
export type FileDropResult = {
  /** Handler to attach to dragOver events (required to enable dropping) */
  onDragOver: DragEventHandler<HTMLDivElement>;
  /** Handler to attach to drop events */
  onDrop: DragEventHandler<HTMLDivElement>;
  /** Name of the currently uploading file */
  filename: string;
  /** Whether an upload is in progress */
  uploading: boolean;
};

/**
 * Provides drag-and-drop handlers for file uploads.
 * 
 * Handles dropping files from external sources (file system) and internal
 * asset transfers. Supports type filtering and automatic asset uploading.
 * 
 * @param props - Configuration options for file drop behavior
 * @returns Object containing drag handlers and upload state
 * 
 * @example
 * ```typescript
 * const { onDragOver, onDrop, uploading, filename } = useFileDrop({
 *   type: "image",
 *   uploadAsset: true,
 *   onChangeAsset: (asset) => console.log("Uploaded:", asset),
 * });
 * 
 * return (
 *   <div onDragOver={onDragOver} onDrop={onDrop}>
 *     {uploading ? `Uploading ${filename}...` : "Drop image here"}
 *   </div>
 * );
 * ```
 */
export function useFileDrop(props: FileDropProps): FileDropResult {
  const [filename, setFilename] = useState("");
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { uploadAsset, isUploading } = useAssetUpload();
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Use unified deserialization
      const dragData = deserializeDragData(event.dataTransfer);

      // Handle asset drops
      if (dragData?.type === "asset") {
        const asset = dragData.payload as Asset;
        const assetType = asset.content_type.split("/")[0];
        if (
          props.type === "all" ||
          assetType === props.type ||
          (props.type === "document" &&
            (assetType === "application" || assetType === "text"))
        ) {
          props.onChangeAsset?.(asset);
          props.onChange?.(asset.get_url as string);
        } else {
          addNotification({
            type: "error",
            alert: true,
            content: `Invalid file type. Please drop a ${props.type} file.`
          });
        }
        return;
      }

      // Handle text data transfer
      if (event.dataTransfer.items && !event.dataTransfer.files.length) {
        const items = event.dataTransfer.items;
        if (items && items.length > 0) {
          Array.from(items).forEach((item) => {
            if (item.kind === "string") {
              item.getAsString((s) => {
                props.onChange?.(s);
              });
            }
          });
        }
        return;
      }

      // Handle external file drops
      if (hasExternalFiles(event.dataTransfer)) {
        const files = extractFiles(event.dataTransfer);
        const file = files[0];
        if (file) {
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
            addNotification({
              type: "error",
              alert: true,
              content: `Invalid file type. Please drop a ${props.type} file.`
            });
          }
        }
      }
    },
    [props, uploadAsset, addNotification]
  );

  return { onDragOver, onDrop, filename, uploading: isUploading };
}
