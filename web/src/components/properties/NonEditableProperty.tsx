import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import isEqual from "lodash/isEqual";

const NonEditableProperty = (props: PropertyProps) => {
  const id = `non-editable-${props.property.name}-${props.propertyIndex}`;
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
    </>
  );
};

export default memo(NonEditableProperty, isEqual);
