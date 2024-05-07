import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";

export function IntegerProperty(props: PropertyProps) {
  if (!props.property || !props.property.name) {
    return null;
  }

  const id = `slider-${props.property.name}-${props.propertyIndex}`;
  const name = props.property.name.replaceAll("_", " ");
  const description = props.property.description || "No description available";

  const value = Number.isInteger(props.value) ? props.value : 0;

  const min = typeof props.property.min === "number" ? props.property.min : 0;
  const max = typeof props.property.max === "number" ? props.property.max : 100;

  return (
    <>
      <NumberInput
        id={id}
        name={name}
        description={description}
        value={value}
        min={min}
        max={max}
        size="small"
        color="secondary"
        inputType="int"
        onChange={(_, value) => props.onChange(Number(value))}
      />
    </>
  );
}

// export function IntegerProperty(props: PropertyProps) {
//   const id = `slider-${props.property.name}-${props.propertyIndex}`;

//   return (
//     <>
//       <NumberInput
//         id={id}
//         name={props.property.name.replaceAll("_", " ")}
//         description={props.property.description}
//         value={props.value}
//         min={props.property.min ? props.property.min : 0}
//         max={props.property.max ? props.property.max : 100}
//         size="small"
//         color="secondary"
//         inputType="int"
//         onChange={(_, value) => props.onChange(value)} />
//     </>
//   );
// }
