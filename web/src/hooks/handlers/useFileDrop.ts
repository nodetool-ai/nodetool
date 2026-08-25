import { Asset } from "../../stores/ApiTypes";
import { DragEventHandler, useCallback, DragEvent, useState } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../../lib/dragdrop";
import { isString } from "../../utils/typePredicates";

type FileDropProps = {
  /** The type of files to accept: image, audio, video, document, or all */
  type: "image" | "audio" | "video" | "document" | "all";
  /** Whether to upload dropped files as assets to the server */
  uploadAsset?: boolean;
  /** Callback fired when a file is dropped and processed (returns URI) */
  onChange?: (uri: string) => void;
  /** Callback fired when a file is dropped and uploaded as an asset (returns Asset) */
  onChangeAsset?: (asset: Asset) => void;
};

type FileDropResult = {
  /** Handler to attach to dragOver events (required to enable dropping) */
  onDragOver: DragEventHandler<HTMLDivElement>;
  /** Handler to attach to drop events */
  onDrop: DragEventHandler<HTMLDivElement>;
  /** Name of the currently uploading file */
  filename: string;
  /** Whether an upload is in progress */
  uploading: boolean;
};

type AcceptedType = FileDropProps["type"];

const DOCUMENT_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

/**
 * Matched on the top-level part of the content type, so a document dropzone
 * takes any `application/*` or `text/*` asset — deliberately looser than
 * {@link acceptsFile}, which admits three MIME types.
 */
const acceptsAsset = (contentType: string, accept: AcceptedType): boolean => {
  if (accept === "all") return true;
  const category = contentType.split("/")[0];
  if (category === accept) return true;
  return (
    accept === "document" && (category === "application" || category === "text")
  );
};

const acceptsFile = (file: File, accept: AcceptedType): boolean => {
  if (accept === "all") return true;
  if (file.type.startsWith(`${accept}/`)) return true;
  return accept === "document" && DOCUMENT_FILE_TYPES.has(file.type);
};

const invalidTypeNotification = (accept: AcceptedType) => ({
  type: "error" as const,
  alert: true,
  content: `Invalid file type. Please drop a ${accept} file.`
});

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

      const dragData = deserializeDragData(event.dataTransfer);

      if (dragData?.type === "asset") {
        const asset = dragData.payload;
        if (!acceptsAsset(asset.content_type, props.type)) {
          addNotification(invalidTypeNotification(props.type));
          return;
        }
        props.onChangeAsset?.(asset);
        props.onChange?.(asset.get_url as string);
        return;
      }

      // Handle text data transfer
      const { items, files } = event.dataTransfer;
      if (items && files.length === 0) {
        for (const item of Array.from(items)) {
          if (item.kind === "string") {
            item.getAsString((s) => props.onChange?.(s));
          }
        }
        return;
      }

      // Handle external file drops
      if (!hasExternalFiles(event.dataTransfer)) return;
      const file = extractFiles(event.dataTransfer)[0];
      if (!file) return;

      if (!acceptsFile(file, props.type)) {
        addNotification(invalidTypeNotification(props.type));
        return;
      }

      setFilename(file.name);

      if (props.uploadAsset) {
        uploadAsset({
          file,
          source:
            file.type.startsWith("image/") || props.type === "image"
              ? "drop"
              : "file",
          onCompleted: (asset) => props.onChangeAsset?.(asset),
          onFailed: (error) =>
            addNotification({ type: "error", alert: true, content: error })
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (read) => {
        const result = read.target?.result;
        if (isString(result) && result.length > 0) {
          props.onChange?.(result);
        }
      };
      reader.readAsDataURL(file);
    },
    [props, uploadAsset, addNotification]
  );

  return { onDragOver, onDrop, filename, uploading: isUploading };
}
