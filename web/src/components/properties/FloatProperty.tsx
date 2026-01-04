import { memo } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import useMetadataStore from "../../stores/MetadataStore";

const FloatProperty = (props: PropertyProps) => {
  const id = `slider-${props.property.name}-${props.propertyIndex}`;
  const name = props.property.name.replaceAll("_", " ");
  const description = props.property.description || "No description available";

  const value = typeof props.value === "number" ? props.value : 0;

  const nodeMetadata = useMetadataStore(
    (state) =>
      props.nodeType ? state.metadata[props.nodeType] : undefined
  );

  const nodeProperty = nodeMetadata?.properties?.find(
    (p) => p.name === props.property.name
  );

  const min =
    typeof nodeProperty?.min === "number"
      ? nodeProperty.min
      : typeof props.property.min === "number"
        ? props.property.min
        : 0;
  const max =
    typeof nodeProperty?.max === "number"
      ? nodeProperty.max
      : typeof props.property.max === "number"
        ? props.property.max
        : 100;

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
