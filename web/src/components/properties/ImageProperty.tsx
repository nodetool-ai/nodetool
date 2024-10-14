import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";

export default function ImageProperty(props: PropertyProps) {
  const id = `image-${props.property.name}-${props.propertyIndex}`;

  const { asset, uri } = useAsset({ image: props.value });
  const showDropzone =
    props.nodeType === "nodetool.constant.Image" ||
    props.nodeType === "comfy.image.LoadImage";

  return (
    <div className="image-property">
      {!showDropzone && (
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
      )}
      {showDropzone && (
        <PropertyDropzone
          asset={asset}
          uri={uri}
          onChange={props.onChange}
          contentType="image"
          props={props}
        />
      )}
    </div>
  );
}
