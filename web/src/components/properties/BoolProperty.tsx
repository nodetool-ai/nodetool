import { Switch } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import { isEqual } from "lodash";

const BoolProperty = (props: PropertyProps) => {
  const id = `switch-${props.property.name}-${props.propertyIndex}`;

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Switch
        id={id}
        inputProps={{ "aria-labelledby": id }}
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
        name={props.property.name}
        className="nodrag"
        size="small"
      />
    </>
  );
};

export default memo(BoolProperty, isEqual);
