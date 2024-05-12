import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";

export default function FloatProperty(props: PropertyProps) {
  const id = `slider-${props.property.name}-${props.propertyIndex}`;

  return (
    <>
      <NumberInput
        id={id}
        name={props.property.name.replaceAll("_", " ")}
        description={props.property.description}
        value={props.value}
        min={props.property.min ? props.property.min : 0}
        max={props.property.max ? props.property.max : 100}
        size="small"
        color="secondary"
        inputType="float"
        onChange={(_, value) => props.onChange(value)} />
    </>
  );
}
