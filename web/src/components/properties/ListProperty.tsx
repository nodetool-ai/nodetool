import { PropertyProps } from "../node/PropertyInput";
import ListTable, { ListDataType } from "../node/DataTable/ListTable";
import { memo, useCallback, useState } from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent
} from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { isEqual } from "lodash";

const detectTypeFromList = (list: any[]) => {
  if (list.length === 0) {
    return "string";
  }
  const first = list[0];
  if (typeof first === "number") {
    if (Number.isInteger(first)) {
      return "int";
    }
    return "float";
  } else if (typeof first === "string") {
    return "string";
  } else if (typeof first === "object") {
    return "string";
  }
  return "string";
};

const ListProperty = (props: PropertyProps) => {
  const id = `list-${props.property.name}-${props.propertyIndex}`;
  const dataTypes = ["int", "string", "datetime", "float"];

  const value = props.value || [];
  const [dataType, setDataType] = useState<ListDataType>(
    detectTypeFromList(value)
  );

  const handleDataTypeChange = useCallback(
    (event: SelectChangeEvent<ListDataType>) => {
      setDataType(event.target.value as ListDataType);
    },
    []
  );

  if (props.nodeType === "nodetool.constant.List") {
    return (
      <>
        <FormControl fullWidth style={{ marginBottom: "8px" }}>
          <InputLabel id={id}>Data Type</InputLabel>
          <Select
            labelId={id}
            value={dataType}
            onChange={handleDataTypeChange}
            variant="standard"
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
            {dataTypes.map((dataType) => (
              <MenuItem key={dataType} value={dataType}>
                {dataType}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <ListTable
          data={value}
          onDataChange={props.onChange}
          editable={true}
          data_type={dataType}
        />
      </>
    );
  } else {
    return (
      <>
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
      </>
    );
  }
};

export default memo(ListProperty, isEqual);
