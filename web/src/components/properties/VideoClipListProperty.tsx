/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useRef, useState, ChangeEvent } from "react";
import type { PropertyProps } from "../node/PropertyInput.types";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip, CloseButton, FlexColumn, FlexRow, Label, Caption } from "../ui_primitives";
import isEqual from "fast-deep-equal";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { isElectron } from "../../utils/browser";
import { deserializeDragData, hasExternalFiles } from "../../lib/dragdrop";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import NumberInput from "../inputs/NumberInput";

const MAX_CLIP_SPAN = 10;
const DEFAULT_CLIP_END = 8;

interface VideoClipMetadata {
  clipStart?: number;
  clipEnd?: number;
}

interface VideoClipItem {
  uri: string;
  type: string;
  asset_id?: string | null;
  data?: string | null;
  metadata?: VideoClipMetadata | null;
  duration?: number | null;
  format?: string | null;
}

function flattenClipItems(items: unknown): VideoClipItem[] {
  if (!items) {
    return [];
  }
  if (!Array.isArray(items)) {
    if (typeof items === "object" && items !== null && "uri" in items) {
      return [items as VideoClipItem];
    }
    return [];
  }

  const result: VideoClipItem[] = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      result.push(...flattenClipItems(item));
    } else if (typeof item === "object" && item !== null && "uri" in item) {
      result.push(item as VideoClipItem);
    }
  }
  return result;
}

function readClipStart(item: VideoClipItem): number {
  return item.metadata?.clipStart ?? 0;
}

function readClipEnd(item: VideoClipItem, start: number): number {
  const end = item.metadata?.clipEnd;
  if (typeof end === "number") {
    return Math.min(Math.max(end, start + 1), start + MAX_CLIP_SPAN);
  }
  const duration =
    typeof item.duration === "number" && item.duration > 0
      ? Math.min(item.duration, MAX_CLIP_SPAN)
      : DEFAULT_CLIP_END;
  return Math.min(start + duration, start + MAX_CLIP_SPAN);
}

function createClipItem(uri: string): VideoClipItem {
  return {
    type: "video",
    uri,
    asset_id: null,
    data: null,
    metadata: { clipStart: 0, clipEnd: DEFAULT_CLIP_END },
    duration: null,
    format: null
  };
}

function withClipRange(
  item: VideoClipItem,
  clipStart: number,
  clipEnd: number
): VideoClipItem {
  return {
    ...item,
    metadata: {
      ...(item.metadata ?? {}),
      clipStart,
      clipEnd
    }
  };
}

const styles = (theme: Theme) =>
  css({
    ".video-clip-list-property": {
      width: "100%",
      marginBottom: "8px"
    },
    ".property-label": {
      marginBottom: "5px"
    },
    ".clip-card": {
      position: "relative",
      width: "100%",
      paddingTop: "56.25%",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "var(--rounded-md)",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      marginBottom: "8px"
    },
    ".clip-content": {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".clip-content video": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".remove-button": {
      position: "absolute",
      top: "2px",
      right: "2px",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: theme.vars.palette.grey[100],
      zIndex: 2
    },
    ".trim-row": {
      gap: theme.spacing(1),
      alignItems: "flex-start"
    },
    ".trim-field": {
      flex: 1,
      minWidth: 0
    },
    ".dropzone": {
      minHeight: "80px",
      width: "100%",
      textAlign: "center",
      outline: `1px dashed ${theme.vars.palette.grey[600]}`,
      margin: "5px 0",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "var(--rounded-md)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      "&:hover": {
        outline: `1px dashed ${theme.vars.palette.grey[400]}`,
        backgroundColor: "rgba(0, 0, 0, 0.3)"
      },
      "&.drag-over": {
        backgroundColor: theme.vars.palette.grey[600],
        outline: `2px dashed ${theme.vars.palette.grey[100]}`,
        outlineOffset: "-2px"
      }
    }
  });

const VideoClipListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `video-clip-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();
  const maxClips = props.property.max ?? 1;

  const filteredAssets = useAssetGridStore((state) => state.filteredAssets);
  const globalSearchResults = useAssetGridStore((state) => state.globalSearchResults);
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);

  const clips = useMemo(
    () => flattenClipItems(props.value).slice(0, maxClips),
    [props.value, maxClips]
  );
  const clip = clips[0];

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clipStart = clip ? readClipStart(clip) : 0;
  const clipEnd = clip ? readClipEnd(clip, clipStart) : DEFAULT_CLIP_END;

  const setClips = useCallback(
    (nextClips: VideoClipItem[]) => {
      props.onChange(nextClips.slice(0, maxClips));
    },
    [maxClips, props]
  );

  const handleRemoveClip = useCallback(() => {
    setClips([]);
  }, [setClips]);

  const handleAddClip = useCallback(
    (newClip: VideoClipItem) => {
      setClips([newClip]);
    },
    [setClips]
  );

  const handleTrimChange = useCallback(
    (nextStart: number, nextEnd: number) => {
      if (!clip) {
        return;
      }
      const start = Math.max(0, Math.floor(nextStart));
      const end = Math.min(
        Math.max(Math.floor(nextEnd), start + 1),
        start + MAX_CLIP_SPAN
      );
      setClips([withClipRange(clip, start, end)]);
    },
    [clip, setClips]
  );

  const uploadVideoFile = useCallback(
    (file: File) =>
      new Promise<VideoClipItem>((resolve, reject) => {
        uploadAsset({
          file,
          onCompleted: (asset: Asset) => {
            const uri = asset.get_url;
            if (!uri) {
              reject(new Error("Asset URL is missing"));
              return;
            }
            resolve(createClipItem(uri));
          },
          onFailed: (error: string) => {
            reject(new Error(error));
          }
        });
      }),
    [uploadAsset]
  );

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      const dragData = deserializeDragData(event.dataTransfer);
      if (dragData) {
        if (dragData.type === "assets-multiple") {
          const selectedIds = new Set(dragData.payload as string[]);
          for (const asset of [
            ...filteredAssets,
            ...globalSearchResults,
            ...(selectedAssets || [])
          ]) {
            if (
              selectedIds.has(asset.id) &&
              asset.get_url &&
              asset.content_type?.startsWith("video/")
            ) {
              handleAddClip(createClipItem(asset.get_url));
              return;
            }
          }
        }

        if (dragData.type === "asset") {
          const asset = dragData.payload as Asset;
          if (asset.get_url && asset.content_type?.startsWith("video/")) {
            handleAddClip(createClipItem(asset.get_url));
            return;
          }
        }
      }

      if (!hasExternalFiles(event.dataTransfer)) {
        return;
      }

      const files = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith("video/")
      );
      if (files.length === 0) {
        return;
      }

      try {
        handleAddClip(await uploadVideoFile(files[0]));
      } catch (error) {
        console.error("Failed to upload video clip:", error);
      }
    },
    [
      filteredAssets,
      globalSearchResults,
      handleAddClip,
      selectedAssets,
      uploadVideoFile
    ]
  );

  const handleNativeFilePicker = useCallback(async () => {
    if (!window.api?.dialog?.openFile) {
      return;
    }

    try {
      const result = await window.api.dialog.openFile({
        title: "Select video clip",
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"]
          }
        ],
        multiSelections: false
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const filePath = result.filePaths[0];
      const bufferResult = await window.api.clipboard?.readFileBuffer(filePath);
      if (!bufferResult) {
        throw new Error("Failed to read file");
      }

      const pathSegments = filePath.split(/[\\/]/);
      const fileName = pathSegments[pathSegments.length - 1] || "video.mp4";
      const fileBytes = new Uint8Array(bufferResult.buffer.byteLength);
      fileBytes.set(bufferResult.buffer);
      const file = new File([fileBytes], fileName, { type: bufferResult.mimeType });
      handleAddClip(await uploadVideoFile(file));
    } catch (error) {
      console.error("Error opening file picker:", error);
    }
  }, [handleAddClip, uploadVideoFile]);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []).filter((file) =>
        file.type.startsWith("video/")
      );
      if (files.length === 0) {
        return;
      }

      try {
        handleAddClip(await uploadVideoFile(files[0]));
      } catch (error) {
        console.error("Failed to upload video clip:", error);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleAddClip, uploadVideoFile]
  );

  const handleDropzoneClick = useCallback(() => {
    if (isElectron && window.api?.dialog?.openFile) {
      void handleNativeFilePicker();
    } else {
      fileInputRef.current?.click();
    }
  }, [handleNativeFilePicker]);

  return (
    <div className="video-clip-list-property" css={styles(theme)}>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept="video/*,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv"
        onChange={handleFileInputChange}
      />

      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      {clip?.uri ? (
        <FlexColumn gap={1}>
          <div className="clip-card">
            <div className="clip-content">
              <video
                src={clip.uri}
                controls
                muted
                preload="metadata"
                aria-label="Video clip source"
              />
            </div>
            <CloseButton
              className="remove-button"
              onClick={handleRemoveClip}
              buttonSize="small"
              tooltip="Remove clip"
            />
          </div>

          <FlexRow className="trim-row">
            <div className="trim-field">
              <Label>Start (s)</Label>
              <NumberInput
                id={`${id}-start`}
                nodeId={props.nodeId}
                name="start"
                min={0}
                max={clipEnd - 1}
                value={clipStart}
                onChange={(_, value) => handleTrimChange(value, clipEnd)}
                hideLabel
              />
            </div>
            <div className="trim-field">
              <Label>End (s)</Label>
              <NumberInput
                id={`${id}-end`}
                nodeId={props.nodeId}
                name="end"
                min={clipStart + 1}
                max={clipStart + MAX_CLIP_SPAN}
                value={clipEnd}
                onChange={(_, value) => handleTrimChange(clipStart, value)}
                hideLabel
              />
            </div>
          </FlexRow>
          <Caption>
            Trim span: {clipEnd - clipStart}s (max {MAX_CLIP_SPAN}s)
          </Caption>
        </FlexColumn>
      ) : (
        <Tooltip title="Click to select a video clip or drag and drop">
          <div
            role="button"
            tabIndex={0}
            className={`dropzone ${isDragOver ? "drag-over" : ""}`}
            onClick={handleDropzoneClick}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDropzoneClick(); } }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
          >
            <Caption>Click or drop a video clip here</Caption>
          </div>
        </Tooltip>
      )}
    </div>
  );
};

export default memo(VideoClipListProperty, isEqual);
