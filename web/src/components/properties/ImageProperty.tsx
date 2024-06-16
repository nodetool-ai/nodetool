/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import AssetViewer from "../assets/AssetViewer";
import { PropertyProps } from "../node/PropertyInput";
import { TextField } from "@mui/material";

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

  const styles = (theme: any) =>
    css({
      ".property-label": {
        display: "none"
      },
      ".image-url-input": {
        borderRadius: "0",
        backgroundColor: theme.palette.c_gray2,
        margin: "0",
        padding: ".2em .5em .1em .5em"
      },
      ".image-url-input input": {
        margin: 0,
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeTiny,
        padding: ".0"
      },
      ".image-url-input fieldset": {
        border: "0"
      }
    });

  return (
    <div css={styles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <TextField
        className="image-url-input"
        value={uri || ""}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        onChange={(e) => props.onChange({ uri: e.target.value, type: "image" })}
        placeholder="Enter image URL"
      />
      <div
        className={`dropzone ${uri ? "dropped" : ""}`}
        aria-labelledby={id}
        style={{
          borderWidth: uri === "" ? "2px" : "0px"
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
  );
}
