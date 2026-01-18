/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { Button, Tooltip } from "@mui/material";
import ImageDimensions from "../node/ImageDimensions";
import { useTheme } from "@mui/material/styles";
import AssetViewer from "../assets/AssetViewer";
import WaveRecorder from "../audio/WaveRecorder";
import AudioPlayer from "../audio/AudioPlayer";
import VideoRecorder from "../video/VideoRecorder";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import { NodeTextField } from "../ui_primitives";

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

  const [showUrlInput, setShowUrlInput] = useState(false);
  const [openViewer, setOpenViewer] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
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
      ".toggle-url-button": {
        position: "absolute",
        top: "-15px",
        right: "0",
        zIndex: 2,
        color: theme.vars.palette.grey[500],
        backgroundColor: "transparent",
        fontSize: "10px",
        fontWeight: 600,
        lineHeight: "1",
        height: "auto",
        minWidth: "unset",
        margin: "0",
        padding: "2px 4px",
        borderRadius: "4px",
        transition: "all 0.2s ease",
        "&:hover": {
          color: theme.vars.palette.primary.main,
          backgroundColor: theme.vars.palette.action.hover
        }
      },
      ".url-input": {
        width: "calc(100% - 24px)",
        maxWidth: "120px",
        zIndex: 1,
        bottom: "0em",
        margin: "0 0 .5em 0"
      },
      ".dropzone": {
        position: "relative",
        minHeight: "30px",
        width: showUrlInput ? "100%" : "100%",
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

  useEffect(() => {
    setImageDimensions(null);
    // Check if image is already loaded (cached) after DOM update
    requestAnimationFrame(() => {
      if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
        setImageDimensions({
          width: imageRef.current.naturalWidth,
          height: imageRef.current.naturalHeight
        });
      }
    });
  }, [uri, asset?.get_url]);

  const renderViewer = useMemo(() => {
    switch (contentType.split("/")[0]) {
      case "image":
        return (
          <>
            <AssetViewer
              contentType={contentType + "/*"}
              url={uri}
              open={openViewer}
              onClose={() => setOpenViewer(false)}
            />
            <div style={{ position: "relative" }}>
              <img
                ref={imageRef}
                src={asset?.get_url || uri || ""}
                alt=""
                style={{ width: "100%", height: "auto" }}
                onLoad={handleImageLoad}
                onDoubleClick={() => setOpenViewer(true)}
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
                  onClose={() => setOpenViewer(false)}
                />
                <audio
                  style={{ width: "100%", height: "20px" }}
                  onVolumeChange={(e) => (e.currentTarget.volume = 1)}
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
                  onClose={() => setOpenViewer(false)}
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
        // Check file extension
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
  }, [contentType, uri, openViewer, asset, id, filename, handleImageLoad, imageDimensions]);

  return (
    <div css={styles(theme)}>
      <div className="drop-container">
        {showUrlInput && (
          <NodeTextField
            className="url-input"
            value={uri || ""}
            onChange={(e) =>
              onChange({ uri: e.target.value, type: contentType })
            }
            placeholder={`Enter ${contentType.split("/")[0]} URL`}
            sx={{
              backgroundColor: theme.vars.palette.grey[600],
              "& .MuiOutlinedInput-root": {
                height: "1.8em"
              },
              "& .MuiOutlinedInput-input": {
                padding: ".2em .5em",
                fontFamily: theme.fontFamily1,
                fontSize: theme.fontSizeTiny
              },
              "& .MuiOutlinedInput-notchedOutline": {
                border: "0"
              }
            }}
          />
        )}

        <Tooltip
          title={showUrlInput ? "Hide URL input" : "Show input to enter a URL"}
        >
          <Button
            className="toggle-url-button"
            variant="text"
            style={{
              opacity: showUrlInput ? 0.8 : 1
            }}
            onClick={() => setShowUrlInput(!showUrlInput)}
          >
            {showUrlInput ? "X" : "URL"}
          </Button>
        </Tooltip>

        <div
          className={`dropzone ${uri ? "dropped" : ""} ${
            isDragOver ? "drag-over" : ""
          }`}
          style={{
            borderWidth: uri === "" ? "1px" : "0px"
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {uri || contentType.split("/")[0] === "audio" ? (
            renderViewer
          ) : (
            <p className="prop-drop centered uppercase">Drop {contentType}</p>
          )}
        </div>
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
