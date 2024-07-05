/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { Button, TextField } from "@mui/material";
import AssetViewer from "../assets/AssetViewer";
import WaveRecorder from "../audio/WaveRecorder";
import AudioPlayer from "../audio/AudioPlayer";
import { PropertyProps } from "../node/PropertyInput";

interface PropertyDropzoneProps {
  asset: Asset | undefined;
  uri: string | undefined;
  onChange: (value: { uri: string; type: string }) => void;
  contentType: string;
  props: PropertyProps;
}

const PropertyDropzone = ({
  asset,
  uri,
  props,
  onChange,
  contentType
}: PropertyDropzoneProps) => {
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

  const styles = (theme: any) =>
    css({
      ".drop-container": {
        position: "relative",
        width: "100%",
        maxWidth: "140px",
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
        color: theme.palette.c_gray6,
        backgroundColor: theme.palette.c_gray2,
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
        backgroundColor: theme.palette.c_gray2,
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
        width: showUrlInput ? "100%" : "calc(100% - 20px)",
        border: "0",
        maxWidth: "180px",
        textAlign: "left"
      },
      ".dropzone.dropped": {
        width: "100%",
        border: "0",
        maxWidth: "180px"
      },
      ".dropzone p": {
        textAlign: "left"
      },
      ".prop-drop": {
        fontSize: theme.fontSizeTiny,
        lineHeight: "1.1em"
      }
    });

  const renderViewer = () => {
    // if (!uri) return null;
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
              style={{ width: "100%" }}
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
                <AudioPlayer filename={filename} url={uri as string} />
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
      default:
        return null;
    }
  };

  return (
    <div css={styles}>
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
        <Button
          className="toggle-url-button"
          variant="text"
          style={{
            opacity: showUrlInput ? 0.8 : 1
          }}
          onClick={() => setShowUrlInput(!showUrlInput)}
        >
          {showUrlInput ? "Hide URL" : "URL"}
        </Button>

        <div
          className={`dropzone ${uri ? "dropped" : ""}`}
          style={{
            borderWidth: uri === "" ? "1px" : "0px"
          }}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {uri || contentType.split("/")[0] === "audio" ? (
            renderViewer()
          ) : (
            <p className="prop-drop centered uppercase">Drop {contentType}</p>
          )}
        </div>
        {contentType.split("/")[0] === "audio" && (
          <WaveRecorder onChange={onChangeAsset} />
        )}
      </div>
    </div>
  );
};

export default PropertyDropzone;
