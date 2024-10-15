import { Typography } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import { isEqual } from "lodash";

const FileProperty = (props: PropertyProps) => {
  const id = `file-${props.property.name}-${props.propertyIndex}`;
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Typography>{props.value?.id}</Typography>
    </>
  );
};

export default memo(FileProperty, isEqual);
