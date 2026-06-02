import PropertyLabel from "./PropertyLabel";
import type { PropertyProps } from "./PropertyInput.types";

export function InputProperty(props: PropertyProps) {
  const id = `edge-${props.property.name}-${props.propertyIndex}`;

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
        handleTooltipType={props.property.type}
        handleTooltipPosition="left"
      />
    </>
  );
}
