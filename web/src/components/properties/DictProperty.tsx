import { PropertyProps } from "../node/PropertyInput";
import { useCallback, useState } from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent
} from "@mui/material";
import DictTable, { DictDataType } from "../node/DataTable/DictTable";

const detectTypeFromDict = (dict: any) => {
  if (dict.length === 0) {
    return "string";
  }
  const first = dict[0];
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

export default function ListProperty(props: PropertyProps) {
  const id = `list-${props.property.name}-${props.propertyIndex}`;
  const dataTypes = ["int", "string", "datetime", "float"];
  const [dataType, setDataType] = useState<DictDataType>(
    detectTypeFromDict(props.value)
  );

  const handleDataTypeChange = useCallback(
    (event: SelectChangeEvent<DictDataType>) => {
      setDataType(event.target.value as DictDataType);
    },
    []
  );

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
      <DictTable
        data={props.value}
        onDataChange={props.onChange}
        editable={true}
        data_type={dataType}
      />
    </>
  );
}
