import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo } from "react";
import { isEqual } from "lodash";

const ImageProperty = (props: PropertyProps) => {
  const id = `image-${props.property.name}-${props.propertyIndex}`;

  const { asset, uri } = useAsset({ image: props.value });

  return (
    <div className="image-property">
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
        <PropertyDropzone
          asset={asset}
          uri={uri}
          onChange={props.onChange}
          contentType="image"
          props={props}
        />
    </div>
  );
};

export default memo(ImageProperty, isEqual);
