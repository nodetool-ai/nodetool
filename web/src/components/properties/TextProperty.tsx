import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextAssetDisplay from "./TextAssetDisplay";

export default function TextProperty(props: PropertyProps) {
  const id = `textfield-${props.property.name}-${props.propertyIndex}`;
  const assetId = props.value.asset_id;

  return (
    <div>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {props.nodeType === "nodetool.constant.Text" && (
        <TextAssetDisplay assetId={assetId} />
      )}
    </div>
  );
}