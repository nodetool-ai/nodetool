import React, { useMemo } from 'react';
import { Select, FormControl } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";

const EnumProperty: React.FC<PropertyProps> = React.memo((props) => {
  const id = useMemo(() => `enum-${props.property.name}-${props.propertyIndex}`, [props.property.name, props.propertyIndex]);

  const values = useMemo(() => {
    return props.property.type.type === "enum"
      ? props.property.type.values
      : props.property.type.type_args?.[0].values;
  }, [props.property.type]);

  return (
    <>
      <FormControl>
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
        <Select
          id={id}
          labelId={id}
          name={props.property.name}
          value={props.value}
          variant="standard"
          onChange={(e) => props.onChange(e.target.value)}
          className="mui-select nodrag"
          disableUnderline={true}
          MenuProps={{
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "left"
            },
            transformOrigin: {
              vertical: "top",
              horizontal: "left"
            }
          }}
        >
          {values?.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </>
  );
});

EnumProperty.displayName = "EnumProperty";

export default EnumProperty;
