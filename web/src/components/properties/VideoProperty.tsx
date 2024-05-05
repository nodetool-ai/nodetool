import { useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import AssetViewer from "../assets/AssetViewer";
import { PropertyProps } from "../node/PropertyInput";

export function VideoProperty(props: PropertyProps) {
  const id = `video-${props.property.name}-${props.propertyIndex}`;
  const { onDrop, onDragOver, filename } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) => props.onChange({
      asset_id: asset.id,
      uri: asset.get_url,
      type: "video"
    }),
    type: "video"
  });
  const { asset, uri } = useAsset({ video: props.value });
  const [openViewer, setOpenViewer] = useState(false);

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
      <div
        className={`dropzone${uri !== "" ? " dropped" : ""}`}
        aria-labelledby={id}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {uri ? (
          <>
            <AssetViewer
              contentType="video/*"
              asset={asset ? asset : undefined}
              url={uri ? uri : undefined}
              open={openViewer}
              onClose={() => setOpenViewer(false)} />
            <video style={{ width: "100%", height: "auto" }} controls src={uri}>
              Your browser does not support the video element.
            </video>
            <p className="centered uppercase">{filename}</p>
          </>
        ) : (
          <p className="centered uppercase">Drop video</p>
        )}
      </div>
    </>
  );
}
