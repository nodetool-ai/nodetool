import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { Text } from "../ui_primitives";

const FileProperty = (props: PropertyProps) => {
  const id = `file-${props.property.name}-${props.propertyIndex}`;
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Text>{props.value?.id}</Text>
    </>
  );
};

export default memo(FileProperty, isEqual);
