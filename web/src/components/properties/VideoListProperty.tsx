/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useMemo, useRef, ChangeEvent } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import isEqual from "lodash/isEqual";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { isElectron } from "../../utils/browser";
import { deserializeDragData, hasExternalFiles } from "../../lib/dragdrop";
import { useAssetGridStore } from "../../stores/AssetGridStore";

interface VideoItem {
  uri: string;
  type: string;
}

const styles = (theme: Theme) =>
  css({
    ".video-list-property": {
      width: "100%",
      marginBottom: "8px"
    },
    ".property-label": {
      marginBottom: "5px"
    },
    ".video-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gap: "8px",
      marginTop: "8px"
    },
    ".video-item": {
      position: "relative",
      width: "100%",
      paddingTop: "56.25%", // 16:9 aspect ratio
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "all 0.2s ease",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500],
        ".remove-button": {
          opacity: 1
        }
      }
    },
    ".video-content": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    ".video-content video": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".remove-button": {
      position: "absolute",
      top: "2px",
      right: "2px",
      opacity: 0,
      transition: "opacity 0.2s ease",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: theme.vars.palette.grey[100],
      padding: "2px",
      width: "20px",
      height: "20px",
      zIndex: 2,
      "&:hover": {
        backgroundColor: theme.vars.palette.error.main,
        color: theme.vars.palette.common.white
      }
    },
    ".remove-button .MuiSvgIcon-root": {
      fontSize: "14px"
    },
    ".dropzone": {
      position: "relative",
      minHeight: "80px",
      width: "100%",
      border: "0",
      maxWidth: "none",
      textAlign: "center",
      transition: "all 0.2s ease",
      outline: `1px dashed ${theme.vars.palette.grey[600]}`,
      margin: "5px 0",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
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
    },
    ".dropzone p": {
      textAlign: "center",
      fontFamily: theme.fontFamily2,
      textTransform: "uppercase",
      letterSpacing: "1px",
      fontSize: "10px",
      color: theme.vars.palette.grey[500],
      margin: "1em",
      lineHeight: "1.1em"
    }
  });

// Helper to get MIME type from file extension
const getVideoMimeType = (fileName: string): string => {
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    webm: "video/webm",
    mkv: "video/x-matroska"
  };
  return mimeTypes[ext || ""] || "video/mp4";
};

// Helper to flatten potentially nested arrays of items (handles constants + lists)
const flattenVideoItems = (items: unknown): VideoItem[] => {
  if (!items) {
    return [];
  }
  if (!Array.isArray(items)) {
    // Single item - check if it has the right shape
    if (typeof items === "object" && items !== null && "uri" in items) {
      return [items as VideoItem];
    }
    return [];
  }

  const result: VideoItem[] = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      // Nested array - recursively flatten
      result.push(...flattenVideoItems(item));
    } else if (typeof item === "object" && item !== null && "uri" in item) {
      result.push(item as VideoItem);
    }
  }
  return result;
};

const VideoListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `video-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();
  
  // Convert value to array of VideoItem, flattening nested arrays
  const videos: VideoItem[] = useMemo(
    () => flattenVideoItems(props.value),
    [props.value]
  );
  
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddVideos = useCallback(
    (newVideos: VideoItem[]) => {
      const updatedVideos = [...videos, ...newVideos];
      props.onChange(updatedVideos);
    },
    [videos, props]
  );

  const handleRemoveVideo = useCallback(
    (index: number) => {
      const updatedVideos = videos.filter((_, i) => i !== index);
      props.onChange(updatedVideos);
    },
    [videos, props]
  );

  // Handle file drops
  // Handle file drops (both internal nodetool assets and external files)
  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      // First, try to handle internal nodetool asset drops
      const dragData = deserializeDragData(event.dataTransfer);
      if (dragData) {
        const droppedVideos: VideoItem[] = [];

        // Handle multiple assets
        if (dragData.type === "assets-multiple") {
          const selectedIds = dragData.payload as string[];
          const { filteredAssets, globalSearchResults, selectedAssets } = useAssetGridStore.getState();
          const potentialAssets = [...filteredAssets, ...globalSearchResults, ...(selectedAssets || [])];
          const foundAssets = potentialAssets.filter(a => selectedIds.includes(a.id));
          const uniqueAssets = Array.from(new Map(foundAssets.map(item => [item.id, item])).values());

          uniqueAssets.forEach(asset => {
            if (asset.get_url && asset.content_type?.startsWith("video/")) {
              droppedVideos.push({ uri: asset.get_url, type: "video" });
            }
          });
        }

        // Handle single asset
        if (droppedVideos.length === 0 && dragData.type === "asset") {
          const asset = dragData.payload as Asset;
          if (asset.get_url && asset.content_type?.startsWith("video/")) {
            droppedVideos.push({ uri: asset.get_url, type: "video" });
          }
        }

        if (droppedVideos.length > 0) {
          handleAddVideos(droppedVideos);
          return;
        }
      }

      // Fall back to handling external file drops
      if (!hasExternalFiles(event.dataTransfer)) {
        return;
      }

      const files = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith("video/")
      );

      if (files.length === 0) {
        return;
      }

      // Upload all files and collect their assets
      const uploadPromises = files.map(
        (file) =>
          new Promise<VideoItem>((resolve, reject) => {
            uploadAsset({
              file,
              onCompleted: (asset: Asset) => {
                // Validate asset URL before adding
                const uri = asset.get_url;
                if (!uri) {
                  reject(new Error("Asset URL is missing"));
                  return;
                }
                resolve({
                  uri,
                  type: "video"
                });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          })
      );

      try {
        const newVideos = await Promise.all(uploadPromises);
        handleAddVideos(newVideos);
      } catch (error) {
        console.error("Failed to upload videos:", error);
      }
    },
    [uploadAsset, handleAddVideos]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  // Native file picker for Electron
  const handleNativeFilePicker = useCallback(async () => {
    if (!window.api?.dialog?.openFile) {
      return;
    }

    try {
      const result = await window.api.dialog.openFile({
        title: "Select videos",
        filters: [
          { name: "Video", extensions: ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"] }
        ],
        multiSelections: true
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const uploadPromises = result.filePaths.map(async (filePath: string) => {
          const dataUrl = await window.api.clipboard?.readFileAsDataURL(filePath);
          if (!dataUrl) {
            throw new Error("Failed to read file");
          }

          const response = await fetch(dataUrl);
          const blob = await response.blob();

          const pathSegments = filePath.split(/[\\/]/);
          const fileName = pathSegments[pathSegments.length - 1] || "video.mp4";

          const file = new File([blob], fileName, { type: getVideoMimeType(fileName) });

          return new Promise<VideoItem>((resolve, reject) => {
            uploadAsset({
              file,
              onCompleted: (asset: Asset) => {
                const uri = asset.get_url;
                if (!uri) {
                  reject(new Error("Asset URL is missing"));
                  return;
                }
                resolve({ uri, type: "video" });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          });
        });

        const newVideos = await Promise.all(uploadPromises);
        handleAddVideos(newVideos);
      }
    } catch (error) {
      console.error("Error opening file picker:", error);
    }
  }, [uploadAsset, handleAddVideos]);

  // Handle files from browser file input
  const handleBrowserFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file input change (browser fallback)
  const handleFileInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((file) =>
      file.type.startsWith("video/")
    );
    if (files.length === 0) {
      return;
    }

    const uploadPromises = files.map(
      (file) =>
        new Promise<VideoItem>((resolve, reject) => {
          uploadAsset({
            file,
            onCompleted: (asset: Asset) => {
              const uri = asset.get_url;
              if (!uri) {
                reject(new Error("Asset URL is missing"));
                return;
              }
              resolve({ uri, type: "video" });
            },
            onFailed: (error: string) => {
              reject(new Error(error));
            }
          });
        })
    );

    try {
      const newVideos = await Promise.all(uploadPromises);
      handleAddVideos(newVideos);
    } catch (error) {
      console.error("Failed to upload videos:", error);
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [uploadAsset, handleAddVideos]);

  // Handle dropzone click - use native dialog in Electron, file input in browser
  const handleDropzoneClick = useCallback(() => {
    if (isElectron && window.api?.dialog?.openFile) {
      handleNativeFilePicker();
    } else {
      handleBrowserFilePicker();
    }
  }, [handleNativeFilePicker, handleBrowserFilePicker]);

  return (
    <div className="video-list-property" css={styles(theme)}>
      {/* Hidden file input for browser fallback */}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept="video/*,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv"
        onChange={handleFileInputChange}
      />

      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      
      {/* Video Grid */}
      {videos.length > 0 && (
        <div className="video-grid">
          {videos.map((video, index) => (
            <div key={video.uri} className="video-item">
              <div className="video-content">
                <video
                  src={video.uri}
                  controls
                  muted
                  preload="metadata"
                  aria-label={`Video ${index + 1}`}
                />
              </div>
              <Tooltip title="Remove video">
                <IconButton
                  className="remove-button"
                  onClick={() => handleRemoveVideo(index)}
                  size="small"
                  aria-label="Remove video"
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      <Tooltip title="Click to select videos or drag and drop">
        <div
          className={`dropzone ${isDragOver ? "drag-over" : ""}`}
          onClick={handleDropzoneClick}
          onDragOver={onDragOver}
          onDragLeave={handleDragLeave}
          onDrop={onDrop}
        >
          <p>Click or drop videos here</p>
        </div>
      </Tooltip>
    </div>
  );
};

export default memo(VideoListProperty, isEqual);
