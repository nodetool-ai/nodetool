import { memo } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";

const FloatProperty = (props: PropertyProps) => {
  const id = `slider-${props.property.name}-${props.propertyIndex}`;
  const name = props.property.name.replaceAll("_", " ");
  const description = props.property.description || "No description available";

  const value = typeof props.value === "number" ? props.value : 0;

  const min =
    typeof props.property.min === "number" ? props.property.min : 0;
  const max =
    typeof props.property.max === "number" ? props.property.max : 100;

  return (
    <>
      <NumberInput
        id={id}
        nodeId={props.nodeId}
        name={name}
        description={description}
        value={value}
        min={min}
        max={max}
        size="small"
        color="secondary"
        inputType="float"
        hideLabel={props.hideLabel}
        tabIndex={props.tabIndex}
        zoomAffectsDragging={true}
        changed={props.changed}
        onChange={(_, value) => props.onChange(Number(value))}
      />
    </>
  );
};

export default memo(FloatProperty, isEqual);
