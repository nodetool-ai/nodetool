import { memo } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import { useInputMinMax } from "../../hooks/useInputMinMax";

const IntegerProperty = (props: PropertyProps) => {
  const id = `slider-${props.property.name}-${props.propertyIndex}`;
  const name = props.property.name.replaceAll("_", " ");
  const description = props.property.description || "No description available";

  const value = Number.isInteger(props.value) ? props.value : 0;

  const { min, max } = useInputMinMax({
    nodeType: props.nodeType,
    nodeId: props.nodeId,
    propertyName: props.property.name,
    propertyMin: props.property.min,
    propertyMax: props.property.max,
  });

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
        zoomAffectsDragging={true}
        changed={props.changed}
        onChange={(_, value) => props.onChange(Number(value))}
      />
    </>
  );
};

export default memo(IntegerProperty, isEqual);
