import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";

export default function NonEditableProperty(props: PropertyProps) {
  const id = `non-editable-${props.property.name}-${props.propertyIndex}`;
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
    </>
  );
}
