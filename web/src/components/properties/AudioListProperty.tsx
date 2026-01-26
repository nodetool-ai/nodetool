/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useMemo } from "react";
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

const AudioListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `audio-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();
  
  // Convert value to array of AudioItem
  const audios: AudioItem[] = useMemo(
    () => (Array.isArray(props.value) ? props.value : []),
    [props.value]
  );
  
  const [isDragOver, setIsDragOver] = useState(false);

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
  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

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
    [uploadAsset, handleAddAudios]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <div className="audio-list-property" css={styles(theme)}>
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
                  onClick={() => handleRemoveAudio(index)}
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
      <div
        className={`dropzone ${isDragOver ? "drag-over" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={handleDragLeave}
        onDrop={onDrop}
      >
        <p>Drop audio files here</p>
      </div>
    </div>
  );
};

export default memo(AudioListProperty, isEqual);
