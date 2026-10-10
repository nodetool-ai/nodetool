import { useCallback } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import { useInputMinMax } from "../../hooks/useInputMinMax";
import { useUndoGroup } from "../../hooks/useUndoGroup";
import { isNumber } from "../../utils/typePredicates";

interface NumberPropertyProps extends PropertyProps<number> {
  inputType: "int" | "float";
}

/** Body shared by IntegerProperty and FloatProperty. */
const NumberProperty = ({ inputType, ...props }: NumberPropertyProps) => {
  const {
    property,
    nodeId,
    value: propValue,
    hideLabel,
    tabIndex,
    changed,
    onChange,
    onChangeComplete
  } = props;
  const id = `slider-${property.name}-${props.propertyIndex}`;
  const name = property.name.replaceAll("_", " ");
  const description = property.description || "No description available";

  const isValid = inputType === "int" ? Number.isInteger : isNumber;
  const value = isValid(propValue) ? propValue : 0;
  // One undo entry per slider drag, ended on unmount if the drag is cut off.
  const dragUndoGroup = useUndoGroup();

  const { min, max } = useInputMinMax({
    nodeType: props.nodeType,
    nodeId: props.nodeId,
    propertyName: props.property.name,
    propertyMin: props.property.min,
    propertyMax: props.property.max
  });

  // Hide slider for min/max properties on input nodes (they define the range, not use it)
  const isInputNode =
    props.nodeType === "nodetool.input.IntegerInput" ||
    props.nodeType === "nodetool.input.FloatInput";
  const isMinMaxProperty = property.name === "min" || property.name === "max";
  const showSlider = !(isInputNode && isMinMaxProperty);

  const handleChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement> | null, newValue: number) => {
      onChange(Number(newValue));
    },
    [onChange]
  );

  return (
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
      inputType={inputType}
      hideLabel={hideLabel}
      tabIndex={tabIndex}
      zoomAffectsDragging={true}
      changed={changed}
      showSlider={showSlider}
      onChange={handleChange}
      onChangeComplete={onChangeComplete}
      onDragStart={dragUndoGroup.begin}
      onDragEnd={dragUndoGroup.end}
    />
  );
};

export default NumberProperty;
