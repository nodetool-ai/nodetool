import { memo } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";
import PropertyLabel from "../node/PropertyLabel";

const IntegerProperty = (props: PropertyProps) => {
  const id = `slider-${props.property.name}-${props.propertyIndex}`;
  const name = props.property.name.replaceAll("_", " ");
  const description = props.property.description || "No description available";

  const value = Number.isInteger(props.value) ? props.value : 0;

  const min = typeof props.property.min === "number" ? props.property.min : 0;
  const max =
    typeof props.property.max === "number" ? props.property.max : 4096;

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
        inputType="int"
        hideLabel={props.hideLabel}
        tabIndex={props.tabIndex}
        onChange={(_, value) => props.onChange(Number(value))}
      />
    </>
  );
};

export default memo(IntegerProperty, isEqual);
