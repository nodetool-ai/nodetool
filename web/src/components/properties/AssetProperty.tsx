import { Typography } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";

export function AssetProperty(props: PropertyProps) {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
      <Typography>{props.value?.id}</Typography>
    </>
  );
}
