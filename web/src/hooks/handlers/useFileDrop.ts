import { Asset } from "../../stores/ApiTypes";
import { DragEventHandler, useCallback, DragEvent, useState } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles,
  resolveAssetsMultiple
} from "../../lib/dragdrop";
import { isString } from "../../utils/typePredicates";
import {
  isEditableMarkdownDocument,
  isImportableDocument
} from "../../utils/assetLanguage";

type FileDropProps = {
  /** The type of files to accept: image, audio, video, document, or all */
  type: "image" | "audio" | "video" | "document" | "all";
  /** When `type === "document"`, also accept `.txt`, `.html`, `.docx`, `.pdf` for conversion */
  acceptDocumentImport?: boolean;
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

const acceptsAsset = (
  asset: Pick<Asset, "content_type" | "name">,
  accept: AcceptedType,
  acceptDocumentImport?: boolean
): boolean => {
  if (accept === "all") return true;
  if (accept === "document") {
    return acceptDocumentImport
      ? isImportableDocument(asset.content_type, asset.name)
      : isEditableMarkdownDocument(asset.content_type, asset.name);
  }
  const category = asset.content_type.split("/")[0];
  return category === accept;
};

const acceptsFile = (
  file: File,
  accept: AcceptedType,
  acceptDocumentImport?: boolean
): boolean => {
  if (accept === "all") return true;
  if (accept === "document") {
    return acceptDocumentImport
      ? isImportableDocument(file.type, file.name)
      : isEditableMarkdownDocument(file.type, file.name);
  }
  return file.type.startsWith(`${accept}/`);
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

      // Examples are copied in by the targets that take them (a 3D model
      // input handles "example-model" itself); everywhere else they are the
      // wrong kind of value, not text to paste in.
      if (dragData?.type.startsWith("example-")) {
        addNotification(invalidTypeNotification(props.type));
        return;
      }

      // A multi-selection drag onto this single-value field uses the first
      // selected asset of an accepted type.
      const droppedAssets =
        dragData?.type === "asset"
          ? [dragData.payload]
          : dragData?.type === "assets-multiple"
            ? resolveAssetsMultiple(
                dragData.payload,
                dragData.metadata?.assets,
                []
              )
            : null;
      if (droppedAssets) {
        if (droppedAssets.length === 0) {
          return;
        }
        const asset = droppedAssets.find((candidate) =>
          acceptsAsset(candidate, props.type, props.acceptDocumentImport)
        );
        if (!asset) {
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

      if (!acceptsFile(file, props.type, props.acceptDocumentImport)) {
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
