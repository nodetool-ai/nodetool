/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { Button, TextField, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AssetViewer from "../assets/AssetViewer";
import WaveRecorder from "../audio/WaveRecorder";
import AudioPlayer from "../audio/AudioPlayer";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";

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
        top: "0",
        right: "0",
        zIndex: 2,
        color: theme.vars.palette.grey[100],
        backgroundColor: theme.vars.palette.grey[600],
        fontSize: theme.fontSizeTinyer,
        lineHeight: "1.1em",
        width: "15px",
        height: "15px",
        minWidth: "unset",
        margin: "0",
        padding: ".2em",
        borderRadius: "0"
      },
      ".url-input": {
        height: "1em",
        width: "calc(100% - 24px)",
        maxWidth: "120px",
        zIndex: 1,
        bottom: "0em",
        borderRadius: "0",
        backgroundColor: theme.vars.palette.grey[600],
        margin: "0 0 .5em 0",
        padding: ".2em .5em .1em .5em"
      },
      ".url-input input": {
        margin: 0,
        maxWidth: "230px",
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeTiny,
        padding: "0"
      },
      ".url-input fieldset": {
        border: "0"
      },
      ".dropzone": {
        minHeight: "30px",
        width: showUrlInput ? "100%" : "100%",
        border: "0",
        maxWidth: "none",
        textAlign: "left",
        transition: "all 0.2s ease",
        "&.drag-over": {
          backgroundColor: theme.vars.palette.grey[600],
          outline: `2px dashed ${theme.vars.palette.grey[100]}`,
          outlineOffset: "-2px"
        }
      },
      ".dropzone.dropped": {
        width: "100%",
        border: "0",
        maxWidth: "none"
      },
      ".dropzone p": {
        textAlign: "left"
      },
      ".prop-drop": {
        fontSize: theme.fontSizeTiny,
        lineHeight: "1.1em"
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
            <img
              src={asset?.get_url || uri || ""}
              alt=""
              style={{ width: "100%", height: "auto" }}
              onDoubleClick={() => setOpenViewer(true)}
            />
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
  }, [contentType, uri, openViewer, asset, id, filename]);

  return (
    <div css={styles(theme)}>
      <div className="drop-container">
        {showUrlInput && (
          <TextField
            className="url-input nowheel nodrag"
            value={uri || ""}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            onChange={(e) =>
              onChange({ uri: e.target.value, type: contentType })
            }
            placeholder={`Enter ${contentType.split("/")[0]} URL`}
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
      </div>
    </div>
  );
};

export default memo(PropertyDropzone, isEqual);
