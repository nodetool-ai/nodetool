import { Switch } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import { isEqual } from "lodash";

const BoolProperty = (props: PropertyProps) => {
  const id = `switch-${props.property.name}-${props.propertyIndex}`;

  return (
    <div className="bool-property">
      <Switch
        id={id}
        inputProps={{ "aria-labelledby": id }}
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
        name={props.property.name}
        className="nodrag"
        size="small"
      />
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
    </div>
  );
};

export default memo(BoolProperty, isEqual);
