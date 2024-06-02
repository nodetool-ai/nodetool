import { useEffect, useState } from "react";
import axios from "axios";
import { useAssetStore } from "../../hooks/AssetStore";
import { devError } from "../../utils/DevLog";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";

export default function TextProperty(props: PropertyProps) {
  const id = `textfield-${props.property.name}-${props.propertyIndex}`;
  const uri = props.value.uri;
  const assetId = props.value.asset_id;
  const getAsset = useAssetStore((state) => state.get);
  const [firstBytes, setFirstBytes] = useState<string | null>(null);

  useEffect(() => {
    getAsset(assetId)
      .then((asset) => {
        if (!asset?.get_url) throw new Error("Asset has no get_url");
        axios
          .get(asset?.get_url, {
            responseType: "arraybuffer",
            headers: { Range: "bytes=0-1024" }
          })
          .then((response) => {
            const data = new TextDecoder().decode(
              new Uint8Array(response.data)
            );
            setFirstBytes(data);
          })
          .catch(devError);
      })
      .catch(devError);
  }, [assetId, getAsset, uri]);

  return (
    <div
      style={{ minHeight: "20px", overflowY: "auto" }}
      className="nodrag nowheel"
    >
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
      <code>{firstBytes}...</code>
    </div>
  );
}
