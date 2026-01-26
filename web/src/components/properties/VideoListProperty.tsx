/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Button } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import isEqual from "lodash/isEqual";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { isElectron } from "../../utils/browser";

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
    ".native-picker-button": {
      color: theme.vars.palette.grey[500],
      backgroundColor: "transparent",
      minWidth: "unset",
      transition: "all 0.2s ease",
      marginBottom: "4px",
      "&:hover": {
        color: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.action.hover
      },
      "& svg": {
        fontSize: "1.2rem"
      }
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

const VideoListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `video-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();
  
  // Convert value to array of VideoItem
  const videos: VideoItem[] = useMemo(
    () => (Array.isArray(props.value) ? props.value : []),
    [props.value]
  );
  
  const [isDragOver, setIsDragOver] = useState(false);

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
  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

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

          const file = new File([blob], fileName, { type: "video/mp4" });

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

  return (
    <div className="video-list-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      {/* Native file picker for Electron */}
      {isElectron && (
        <Tooltip title="Select video files from your computer">
          <Button
            className="native-picker-button"
            variant="text"
            onClick={handleNativeFilePicker}
          >
            <FolderOpenIcon />
            Select videos
          </Button>
        </Tooltip>
      )}
      
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
      <div
        className={`dropzone ${isDragOver ? "drag-over" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={handleDragLeave}
        onDrop={onDrop}
      >
        <p>Drop videos here</p>
      </div>
    </div>
  );
};

export default memo(VideoListProperty, isEqual);
