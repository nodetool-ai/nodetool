import { memo, useCallback } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "fast-deep-equal";
import { useInputMinMax } from "../../hooks/useInputMinMax";
import { useTemporalNodes } from "../../contexts/NodeContext";

const IntegerProperty = (props: PropertyProps) => {
  const { property, nodeId, value: propValue, hideLabel, tabIndex, changed, onChange, onChangeComplete } = props;
  const id = `slider-${property.name}-${props.propertyIndex}`;
  const name = property.name.replaceAll("_", " ");
  const description = property.description || "No description available";

  const value = Number.isInteger(propValue) ? propValue : 0;
  const pauseHistory = useTemporalNodes((state) => state.pause);
  const resumeHistory = useTemporalNodes((state) => state.resume);

  const { min, max } = useInputMinMax({
    nodeType: props.nodeType,
    nodeId: props.nodeId,
    propertyName: props.property.name,
    propertyMin: props.property.min,
    propertyMax: props.property.max,
  });

  // Hide slider for min/max properties on input nodes (they define the range, not use it)
  const isInputNode = props.nodeType === "nodetool.input.IntegerInput" || props.nodeType === "nodetool.input.FloatInput";
  const isMinMaxProperty = property.name === "min" || property.name === "max";
  const showSlider = !(isInputNode && isMinMaxProperty);

  // Memoize handler to prevent unnecessary re-renders of memoized NumberInput child
  const handleChange = useCallback((_: React.ChangeEvent<HTMLInputElement> | null, newValue: number) => {
    onChange(Number(newValue));
  }, [onChange]);

  const handleDragStart = useCallback(() => {
    pauseHistory();
  }, [pauseHistory]);

  const handleDragEnd = useCallback(() => {
    resumeHistory();
  }, [resumeHistory]);

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
        showSlider={showSlider}
        onChange={handleChange}
        onChangeComplete={onChangeComplete}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
    </>
  );
};

export default memo(IntegerProperty, isEqual);
