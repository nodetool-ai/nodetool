import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { useNodes } from "../../contexts/NodeContext";

const ImageProperty = (props: PropertyProps) => {
  const id = `image-${props.property.name}-${props.propertyIndex}`;

  const { asset, uri } = useAsset({ image: props.value });

  const isConnected = useNodes((state) => {
    return state.edges.some(
      (edge) =>
        edge.target == props.nodeId && edge.targetHandle === props.property.name
    );
  });

  return (
    <div className="image-property">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {!isConnected && (
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
};

export default memo(ImageProperty, isEqual);
