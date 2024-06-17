/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState, ReactNode } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { Button, TextField } from "@mui/material";

interface PropertyDropzoneProps {
  asset: Asset | undefined;
  uri: string | undefined;
  onChange: (value: { uri: string; type: string }) => void;
  children: ReactNode;
}

const PropertyDropzone = ({
  asset,
  uri,
  onChange,
  children
}: PropertyDropzoneProps) => {
  const { onDrop, onDragOver } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) =>
      onChange({ uri: asset.get_url || "", type: "image" }),
    type: "image"
  });

  const [showUrlInput, setShowUrlInput] = useState(false);

  const styles = (theme: any) =>
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
        color: theme.palette.c_gray6,
        backgroundColor: theme.palette.c_gray2,
        fontSize: theme.fontSizeTinyer,
        lineHeight: "1.1em",
        width: "20px",
        height: "15px",
        minWidth: "unset",
        margin: "0",
        padding: ".2em",
        borderRadius: "0"
      },
      ".url-input": {
        height: "1em",
        width: "calc(100% - 24px)",
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
        width: showUrlInput ? "100%" : "calc(100% - 25px)",
        border: "0",
        maxWidth: "180px",
        textAlign: "left"
      },
      ".dropzone.dropped": {
        width: "100%",
        border: "0",
        maxWidth: "180px",
        textAlign: "center"
      },
      ".dropzone p": {
        textAlign: "left"
      },
      ".dropzone.dropped p": {
        textAlign: "center"
      }
    });

  return (
    <div css={styles}>
      <div className="drop-container">
        {showUrlInput && (
          <TextField
            className="url-input"
            value={uri || ""}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            onChange={(e) => onChange({ uri: e.target.value, type: "image" })}
            placeholder="Enter Image URL"
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
          {showUrlInput ? "Hide URL" : "Show URL"}
        </Button>
        <div
          className={`dropzone ${uri ? "dropped" : ""}`}
          style={{
            borderWidth: uri === "" ? "1px" : "0px"
          }}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {uri ? children : <p className="centered uppercase">Drop image</p>}
        </div>
      </div>
    </div>
  );
};

export default PropertyDropzone;
