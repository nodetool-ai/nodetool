/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import AssetViewer from "../assets/AssetViewer";
import { PropertyProps } from "../node/PropertyInput";
import { Button, TextField } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";

export default function ImageProperty(props: PropertyProps) {
  const id = `image-${props.property.name}-${props.propertyIndex}`;
  const { onDrop, onDragOver } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) =>
      props.onChange({ asset_id: asset.id, uri: asset.get_url, type: "image" }),
    type: "image"
  });
  const { asset, uri } = useAsset({ image: props.value });
  const [openViewer, setOpenViewer] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const styles = (theme: any) =>
    css({
      ".property-label": {
        display: "none"
      },
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
        // width: "calc(100% - 25px)",
        width: showUrlInput ? "100%" : "calc(100% - 25px)",
        border: "0",
        maxWidth: "180px"
      },
      ".dropzone.dropped": {
        width: "100%",
        border: "0",
        maxWidth: "180px"
      }
    });

  return (
    <div css={styles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <div className="drop-container">
        <>
          {showUrlInput && (
            <TextField
              className="url-input"
              value={uri || ""}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              onChange={(e) =>
                props.onChange({ uri: e.target.value, type: "image" })
              }
              placeholder="Enter Image URL"
            />
          )}
          <Button
            className="toggle-url-button"
            variant="text"
            style={{
              opacity: showUrlInput ? 0.8 : 1
              // top: showUrlInput ? "0" : "1em"
            }}
            onClick={() => setShowUrlInput(!showUrlInput)}
          >
            {showUrlInput ? "Hide URL" : "Show URL"}
          </Button>
        </>
        <div
          className={`dropzone ${uri ? "dropped" : ""}`}
          aria-labelledby={id}
          style={{
            borderWidth: uri === "" ? "1px" : "0px"
          }}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {asset || uri ? (
            <div>
              <AssetViewer
                contentType="image/*"
                asset={asset ? asset : undefined}
                url={uri ? uri : undefined}
                open={openViewer}
                onClose={() => setOpenViewer(false)}
              />
              <img
                src={asset?.get_url || uri || ""}
                alt=""
                style={{ width: "100%" }}
                onDoubleClick={() => setOpenViewer(true)}
              />
            </div>
          ) : (
            <p className="centered uppercase">Drop image</p>
          )}
        </div>
      </div>
    </div>
  );
}
