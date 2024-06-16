import { useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import AssetViewer from "../assets/AssetViewer";
import { PropertyProps } from "../node/PropertyInput";
import { Button, TextField } from "@mui/material";

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

  const [showTextField, setShowTextField] = useState(false);

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Button variant="text" onClick={() => setShowTextField(!showTextField)}>
        Enter Image URL
      </Button>
      {showTextField && (
        <TextField
          value={uri || ""}
          onChange={(e) =>
            props.onChange({ uri: e.target.value, type: "image" })
          }
          placeholder="Enter image URL"
        />
      )}
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
    </>
  );
}
