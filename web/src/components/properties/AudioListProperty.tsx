/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useMemo, useRef, ChangeEvent } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import isEqual from "lodash/isEqual";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { isElectron } from "../../utils/browser";
import { deserializeDragData, hasExternalFiles } from "../../lib/dragdrop";
import { useAssetGridStore } from "../../stores/AssetGridStore";

interface AudioItem {
  uri: string;
  type: string;
}

const styles = (theme: Theme) =>
  css({
    ".audio-list-property": {
      width: "100%",
      marginBottom: "8px"
    },
    ".property-label": {
      marginBottom: "5px"
    },
    ".audio-grid": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "8px"
    },
    ".audio-item": {
      position: "relative",
      width: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "all 0.2s ease",
      padding: "8px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500],
        ".remove-button": {
          opacity: 1
        }
      }
    },
    ".audio-icon": {
      color: theme.vars.palette.grey[400],
      fontSize: "24px"
    },
    ".audio-content": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minWidth: 0
    },
    ".audio-content audio": {
      width: "100%",
      height: "32px"
    },
    ".audio-filename": {
      fontSize: "11px",
      color: theme.vars.palette.grey[400],
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "150px"
    },
    ".remove-button": {
      opacity: 0,
      transition: "opacity 0.2s ease",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: theme.vars.palette.grey[100],
      padding: "2px",
      width: "20px",
      height: "20px",
      flexShrink: 0,
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
const getAudioMimeType = (fileName: string): string => {
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    aac: "audio/aac"
  };
  return mimeTypes[ext || ""] || "audio/mpeg";
};

// Helper to flatten potentially nested arrays of items (handles constants + lists)
const flattenAudioItems = (items: unknown): AudioItem[] => {
  if (!items) {
    return [];
  }
  if (!Array.isArray(items)) {
    // Single item - check if it has the right shape
    if (typeof items === "object" && items !== null && "uri" in items) {
      return [items as AudioItem];
    }
    return [];
  }

  const result: AudioItem[] = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      // Nested array - recursively flatten
      result.push(...flattenAudioItems(item));
    } else if (typeof item === "object" && item !== null && "uri" in item) {
      result.push(item as AudioItem);
    }
  }
  return result;
};

const AudioListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `audio-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();

  // Use selectors for asset grid store to avoid full store subscriptions
  const filteredAssets = useAssetGridStore((state) => state.filteredAssets);
  const globalSearchResults = useAssetGridStore((state) => state.globalSearchResults);
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);

  // Convert value to array of AudioItem, flattening nested arrays
  const audios: AudioItem[] = useMemo(
    () => flattenAudioItems(props.value),
    [props.value]
  );

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddAudios = useCallback(
    (newAudios: AudioItem[]) => {
      const updatedAudios = [...audios, ...newAudios];
      props.onChange(updatedAudios);
    },
    [audios, props]
  );

  const handleRemoveAudio = useCallback(
    (index: number) => {
      const updatedAudios = audios.filter((_, i) => i !== index);
      props.onChange(updatedAudios);
    },
    [audios, props]
  );

  // Memoize click handlers for each audio index to avoid recreating functions on every render
  const removeAudioHandlers = useMemo(() => {
    const handlers: Record<number, () => void> = {};
    for (let i = 0; i < audios.length; i++) {
      handlers[i] = () => handleRemoveAudio(i);
    }
    return handlers;
  }, [audios.length, handleRemoveAudio]);

  // Extract filename from URI
  const getFilename = useCallback((uri: string) => {
    try {
      const url = new URL(uri);
      const pathname = url.pathname;
      const filename = pathname.split("/").pop() || "audio";
      return decodeURIComponent(filename);
    } catch {
      return "audio";
    }
  }, []);

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
        const droppedAudios: AudioItem[] = [];

        // Handle multiple assets
        if (dragData.type === "assets-multiple") {
          const selectedIds = dragData.payload as string[];
          // Optimize: Use Set for O(1) lookup and single-pass iteration
          const selectedIdsSet = new Set(selectedIds);
          const uniqueAssets = [];
          const seenIds = new Set<string>();

          // Single pass through all potential assets
          for (const asset of [
            ...filteredAssets,
            ...globalSearchResults,
            ...(selectedAssets || [])
          ]) {
            if (
              selectedIdsSet.has(asset.id) &&
              !seenIds.has(asset.id)
            ) {
              uniqueAssets.push(asset);
              seenIds.add(asset.id);
            }
          }

          uniqueAssets.forEach(asset => {
            if (asset.get_url && asset.content_type?.startsWith("audio/")) {
              droppedAudios.push({ uri: asset.get_url, type: "audio" });
            }
          });
        }

        // Handle single asset
        if (droppedAudios.length === 0 && dragData.type === "asset") {
          const asset = dragData.payload as Asset;
          if (asset.get_url && asset.content_type?.startsWith("audio/")) {
            droppedAudios.push({ uri: asset.get_url, type: "audio" });
          }
        }

        if (droppedAudios.length > 0) {
          handleAddAudios(droppedAudios);
          return;
        }
      }

      // Fall back to handling external file drops
      if (!hasExternalFiles(event.dataTransfer)) {
        return;
      }

      const files = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith("audio/")
      );

      if (files.length === 0) {
        return;
      }

      // Upload all files and collect their assets
      const uploadPromises = files.map(
        (file) =>
          new Promise<AudioItem>((resolve, reject) => {
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
                  type: "audio"
                });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          })
      );

      try {
        const newAudios = await Promise.all(uploadPromises);
        handleAddAudios(newAudios);
      } catch (error) {
        console.error("Failed to upload audio files:", error);
      }
    },
    [uploadAsset, handleAddAudios, filteredAssets, globalSearchResults, selectedAssets]
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
        title: "Select audio files",
        filters: [
          { name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "flac", "aac"] }
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
          const fileName = pathSegments[pathSegments.length - 1] || "audio.mp3";

          const file = new File([blob], fileName, { type: getAudioMimeType(fileName) });

          return new Promise<AudioItem>((resolve, reject) => {
            uploadAsset({
              file,
              onCompleted: (asset: Asset) => {
                const uri = asset.get_url;
                if (!uri) {
                  reject(new Error("Asset URL is missing"));
                  return;
                }
                resolve({ uri, type: "audio" });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          });
        });

        const newAudios = await Promise.all(uploadPromises);
        handleAddAudios(newAudios);
      }
    } catch (error) {
      console.error("Error opening file picker:", error);
    }
  }, [uploadAsset, handleAddAudios]);

  // Handle files from browser file input
  const handleBrowserFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file input change (browser fallback)
  const handleFileInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((file) =>
      file.type.startsWith("audio/")
    );
    if (files.length === 0) {
      return;
    }

    const uploadPromises = files.map(
      (file) =>
        new Promise<AudioItem>((resolve, reject) => {
          uploadAsset({
            file,
            onCompleted: (asset: Asset) => {
              const uri = asset.get_url;
              if (!uri) {
                reject(new Error("Asset URL is missing"));
                return;
              }
              resolve({ uri, type: "audio" });
            },
            onFailed: (error: string) => {
              reject(new Error(error));
            }
          });
        })
    );

    try {
      const newAudios = await Promise.all(uploadPromises);
      handleAddAudios(newAudios);
    } catch (error) {
      console.error("Failed to upload audio files:", error);
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [uploadAsset, handleAddAudios]);

  // Handle dropzone click - use native dialog in Electron, file input in browser
  const handleDropzoneClick = useCallback(() => {
    if (isElectron && window.api?.dialog?.openFile) {
      handleNativeFilePicker();
    } else {
      handleBrowserFilePicker();
    }
  }, [handleNativeFilePicker, handleBrowserFilePicker]);

  return (
    <div className="audio-list-property" css={styles(theme)}>
      {/* Hidden file input for browser fallback */}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
        onChange={handleFileInputChange}
      />

      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      
      {/* Audio List */}
      {audios.length > 0 && (
        <div className="audio-grid">
          {audios.map((audio, index) => (
            <div key={audio.uri} className="audio-item">
              <AudioFileIcon className="audio-icon" />
              <div className="audio-content">
                <audio
                  src={audio.uri}
                  controls
                  preload="metadata"
                  aria-label={getFilename(audio.uri)}
                />
                <Typography className="audio-filename" title={getFilename(audio.uri)}>
                  {getFilename(audio.uri)}
                </Typography>
              </div>
              <Tooltip title="Remove audio">
                <IconButton
                  className="remove-button"
                  onClick={removeAudioHandlers[index]}
                  size="small"
                  aria-label="Remove audio"
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      <Tooltip title="Click to select audio files or drag and drop">
        <div
          className={`dropzone ${isDragOver ? "drag-over" : ""}`}
          onClick={handleDropzoneClick}
          onDragOver={onDragOver}
          onDragLeave={handleDragLeave}
          onDrop={onDrop}
        >
          <p>Click or drop audio files here</p>
        </div>
      </Tooltip>
    </div>
  );
};

export default memo(AudioListProperty, isEqual);
