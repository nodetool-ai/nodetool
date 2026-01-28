/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState, useRef, ChangeEvent } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { Tooltip } from "@mui/material";
import ImageDimensions from "../node/ImageDimensions";
import { useTheme } from "@mui/material/styles";
import AssetViewer from "../assets/AssetViewer";
import WaveRecorder from "../audio/WaveRecorder";
import AudioPlayer from "../audio/AudioPlayer";
import VideoRecorder from "../video/VideoRecorder";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import { isElectron } from "../../utils/browser";
import { useAssetUpload } from "../../serverState/useAssetUpload";

interface PropertyDropzoneProps {
  asset: Asset | undefined;
  uri: string | undefined;
  onChange: (value: { uri: string; type: string }) => void;
  contentType: string;
  props: PropertyProps;
  showRecorder?: boolean;
}

const PropertyDropzone = ({
  asset,
  uri,
  props,
  onChange,
  contentType,
  showRecorder = true
}: PropertyDropzoneProps) => {
  const theme = useTheme();
  const onChangeAsset = (asset: Asset) =>
    props.onChange({ asset_id: asset.id, uri: asset.get_url, type: "audio" });

  const { onDrop, onDragOver, filename } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) =>
      onChange({ uri: asset.get_url || "", type: contentType }),
    type: contentType as "image" | "audio" | "video" | "all"
  });

  const [openViewer, setOpenViewer] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const id = `audio-${props.property.name}-${props.propertyIndex}`;

  const styles = (theme: Theme) =>
    css({
      ".drop-container": {
        position: "relative",
        width: "100%",
        marginTop: "-3px",
        display: "flex",
        flexDirection: "column",
        alignItems: "normal",
        gap: "0"
      },
      ".dropzone": {
        position: "relative",
        minHeight: "30px",
        width: "100%",
        border: "0",
        maxWidth: "none",
        textAlign: "left",
        transition: "all 0.2s ease",
        outline: `1px dashed ${theme.vars.palette.grey[600]}`,
        margin: "5px 0",
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        borderRadius: "6px",

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
      ".dropzone.dropped": {
        width: "100%",
        border: "0",
        maxWidth: "none",
        outline: `1px solid ${theme.vars.palette.grey[700]}`,
        backgroundColor: "transparent",
        padding: "4px"
      },
      ".dropzone p": {
        textAlign: "left"
      },
      ".dropzone p.centered": {
        margin: "auto",
        textAlign: "left",
        padding: "1em",
        minWidth: "60px",
        minHeight: "14px",
        lineHeight: "1.1em",
        fontFamily: theme.fontFamily2,
        textTransform: "uppercase",
        letterSpacing: "1px",
        fontSize: "10px",
        color: theme.vars.palette.grey[500]
      },
      ".dropzone img": {
        height: "auto",
        maxWidth: "100%",
        maxHeight: "300px",
        margin: "0 auto",
        display: "block",
        width: "auto !important",
        borderRadius: "4px"
      },
      ".prop-drop": {
        fontSize: theme.fontSizeTiny,
        lineHeight: "1.1em"
      },
      ".image-dimensions": {
        opacity: 0,
        transition: "opacity 0.2s ease"
      },
      "&:hover .image-dimensions": {
        opacity: 1
      }
    });

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      onDragOver(e);
      setIsDragOver(true);
    },
    [onDragOver]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      onDrop(e);
      setIsDragOver(false);
    },
    [onDrop]
  );

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    setOpenViewer(true);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setOpenViewer(false);
  }, []);

  const _handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ uri: e.target.value, type: contentType });
  }, [onChange, contentType]);

  const handleVolumeChange = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    e.currentTarget.volume = 1;
  }, []);

  const { uploadAsset: uploadAssetFn } = useAssetUpload();

  // Get accept attribute for file input based on content type
  const getAcceptAttribute = useCallback(() => {
    const type = contentType.split("/")[0];
    switch (type) {
      case "image":
        return "image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg";
      case "audio":
        return "audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac";
      case "video":
        return "video/*,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv";
      case "document":
        return ".pdf,.doc,.docx,.txt,.html";
      default:
        return "*/*";
    }
  }, [contentType]);

  // Handle files from browser file input
  const handleBrowserFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file input change (browser fallback)
  const handleFileInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const file = files[0];
    uploadAssetFn({
      file,
      onCompleted: (asset) => {
        onChange({ uri: asset.get_url || "", type: contentType });
      },
      onFailed: (error) => {
        console.error("Failed to upload asset:", error);
      }
    });

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [contentType, onChange, uploadAssetFn]);

  const handleNativeFilePicker = useCallback(async () => {
    if (!window.api?.dialog?.openFile) {
      return;
    }

    try {
      // Get appropriate file filters based on content type
      const getFilters = () => {
        const type = contentType.split("/")[0];
        switch (type) {
          case "image":
            return [
              { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"] }
            ];
          case "audio":
            return [
              { name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "flac", "aac"] }
            ];
          case "video":
            return [
              { name: "Video", extensions: ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"] }
            ];
          case "document":
            return [
              { name: "Documents", extensions: ["pdf", "doc", "docx", "txt", "html"] }
            ];
          default:
            return undefined;
        }
      };

      const result = await window.api.dialog.openFile({
        title: `Select ${contentType.split("/")[0]}`,
        filters: getFilters()
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];

        // Read the file as data URL using Electron's IPC
        const dataUrl = await window.api.clipboard?.readFileAsDataURL(filePath);

        if (!dataUrl) {
          console.error("Failed to read file");
          return;
        }

        // Convert data URL to Blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        // Get filename with fallback that includes an extension
        const pathSegments = filePath.split(/[\\/]/);
        let fileName = pathSegments[pathSegments.length - 1];

        if (!fileName) {
          // If we can't get filename, create one based on content type
          const ext = contentType.split("/")[1] || "bin";
          fileName = `file.${ext}`;
        }

        // Use contentType for consistency, not blob.type which may be incorrect
        const file = new File([blob], fileName, { type: contentType });

        // Upload the file as an asset
        uploadAssetFn({
          file,
          onCompleted: (asset) => {
            onChange({ uri: asset.get_url || "", type: contentType });
          },
          onFailed: (error) => {
            console.error("Failed to upload asset:", error);
          }
        });
      }
    } catch (error) {
      console.error("Error opening file picker:", error);
    }
  }, [contentType, onChange, uploadAssetFn]);

  // Handle dropzone click - use native dialog in Electron, file input in browser
  const handleDropzoneClick = useCallback(() => {
    if (isElectron && window.api?.dialog?.openFile) {
      handleNativeFilePicker();
    } else {
      handleBrowserFilePicker();
    }
  }, [handleNativeFilePicker, handleBrowserFilePicker]);

  const renderViewer = useMemo(() => {
    switch (contentType.split("/")[0]) {
      case "image":
        return (
          <>
            <AssetViewer
              contentType={contentType + "/*"}
              url={uri}
              open={openViewer}
              onClose={handleCloseViewer}
            />
            <div style={{ position: "relative" }}>
              <img
                ref={imageRef}
                src={asset?.get_url || uri || ""}
                alt={asset?.name || ""}
                style={{ width: "100%", height: "auto" }}
                onLoad={handleImageLoad}
                onDoubleClick={handleDoubleClick}
                draggable={false}
              />
              {imageDimensions && (
                <ImageDimensions
                  width={imageDimensions.width}
                  height={imageDimensions.height}
                />
              )}
            </div>
          </>
        );
      case "audio":
        return (
          <>
            {asset || uri ? (
              <div id={id} aria-labelledby={id} className="audio-drop">
                <AssetViewer
                  contentType={contentType + "/*"}
                  asset={asset ? asset : undefined}
                  url={uri ? uri : undefined}
                  open={openViewer}
                  onClose={handleCloseViewer}
                />
                <audio
                  style={{ width: "100%", height: "20px" }}
                  onVolumeChange={handleVolumeChange}
                  src={uri as string}
                >
                  Your browser does not support the audio element.
                </audio>
                <p className="centered uppercase">{filename}</p>
                <AudioPlayer filename={filename} source={uri as string} />
              </div>
            ) : (
              <p className="centered uppercase">Drop audio</p>
            )}
          </>
        );
      case "video":
        return (
          <>
            {uri ? (
              <>
                <AssetViewer
                  contentType="video/*"
                  asset={asset ? asset : undefined}
                  url={uri ? uri : undefined}
                  open={openViewer}
                  onClose={handleCloseViewer}
                />
                <video
                  style={{ width: "100%", height: "auto" }}
                  controls
                  src={uri}
                >
                  Your browser does not support the video element.
                </video>
                <p className="centered uppercase">{filename}</p>
              </>
            ) : (
              <p className="centered uppercase">Drop video</p>
            )}
          </>
        );
      case "document": {
        const fileExtension = uri?.toLowerCase().split(".").pop();

        if (fileExtension === "pdf") {
          return (
            <iframe
              src={uri}
              style={{ width: "100%", height: "400px", border: "none" }}
              allow="fullscreen; clipboard-write"
              title="PDF viewer"
            />
          );
        }

        if (fileExtension === "txt" || fileExtension === "html") {
          return (
            <iframe
              src={uri}
              style={{ width: "100%", height: "400px", border: "none" }}
              allow="fullscreen"
              title="Text viewer"
            />
          );
        }

        return <pre>{asset?.name}</pre>;
      }
      default:
        return null;
    }
  }, [contentType, uri, openViewer, asset, id, filename, handleImageLoad, handleDoubleClick, handleCloseViewer, imageDimensions, handleVolumeChange]);

  return (
    <div css={styles(theme)}>
      {/* Hidden file input for browser fallback */}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept={getAcceptAttribute()}
        onChange={handleFileInputChange}
      />

      <div className="drop-container">
        <Tooltip title="Click to select a file or drag and drop">
          <div
            className={`dropzone ${uri ? "dropped" : ""} ${isDragOver ? "drag-over" : ""
              }`}
            style={{
              borderWidth: uri === "" ? "1px" : "0px"
            }}
            onClick={handleDropzoneClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uri || contentType.split("/")[0] === "audio" ? (
              renderViewer
            ) : (
              <p className="prop-drop centered uppercase">Click or drop {contentType}</p>
            )}
          </div>
        </Tooltip>
        {contentType.split("/")[0] === "audio" && showRecorder && (
          <WaveRecorder onChange={onChangeAsset} />
        )}
        {contentType.split("/")[0] === "video" && showRecorder && (
          <VideoRecorder onChange={onChangeAsset} />
        )}
      </div>
    </div>
  );
};

export default memo(PropertyDropzone, isEqual);
