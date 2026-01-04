import { memo } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import { useInputMinMax } from "../../hooks/useInputMinMax";

const IntegerProperty = (props: PropertyProps) => {
  const { property, nodeId, value: propValue, hideLabel, tabIndex, changed, onChange, onChangeComplete } = props;
  const id = `slider-${property.name}-${props.propertyIndex}`;
  const name = property.name.replaceAll("_", " ");
  const description = property.description || "No description available";

  const value = Number.isInteger(propValue) ? propValue : 0;

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
        nodeId={nodeId}
        name={name}
        description={description}
        value={value}
        min={min}
        max={max}
        size="small"
        color="secondary"
        inputType="int"
        hideLabel={hideLabel}
        tabIndex={tabIndex}
        zoomAffectsDragging={true}
        changed={changed}
        onChange={(_, newValue) => onChange(Number(newValue))}
        onChangeComplete={onChangeComplete}
      />
    </>
  );
};

export default memo(IntegerProperty, isEqual);
