import { memo, useCallback } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";

const IntegerProperty = (props: PropertyProps) => {
  const { property, nodeId, value: propValue, hideLabel, tabIndex, changed, onChange, onChangeComplete } = props;
  const id = `slider-${property.name}-${props.propertyIndex}`;
  const name = property.name.replaceAll("_", " ");
  const description = property.description || "No description available";

  const value = Number.isInteger(propValue) ? propValue : 0;

  const min =
    typeof property.min === "number" ? property.min : undefined;
  const max =
    typeof property.max === "number" ? property.max : undefined;

  const handleChangeComplete = useCallback(
    (_value: number) => {
      if (onChangeComplete) {
        onChangeComplete();
      }
    },
    [onChangeComplete]
  );

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
        onChangeComplete={handleChangeComplete}
      />
    </>
  );
};

export default memo(IntegerProperty, isEqual);
