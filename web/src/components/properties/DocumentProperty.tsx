import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { Text } from "../ui_primitives";
import { useAsset } from "../../serverState/useAsset";
import PropertyDropzone from "./PropertyDropzone";

const DocumentProperty = (props: PropertyProps) => {
  const id = `document-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ document: props.value });

  const showDropzone =
    props.nodeType === "nodetool.constant.Document" ||
    props.nodeType === "nodetool.input.DocumentInput";

  return (
    <div className="document-property">
      {!showDropzone && (
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
      )}
      {showDropzone ? (
        <PropertyDropzone
          asset={asset}
          uri={uri}
          onChange={props.onChange}
          contentType="document"
          props={props}
        />
      ) : (
        <Text>{props.value?.id}</Text>
      )}
    </div>
  );
};

export default memo(DocumentProperty, isEqual);
