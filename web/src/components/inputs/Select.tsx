import React, { memo } from "react";
import { Select, MenuItem } from "@mui/material";
import { isEqual } from "lodash";

interface Option {
  value: any;
  label: string;
}

interface SelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SelectComponent: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder
}) => {
  return (
    <Select
      value={value}
      variant="standard"
      displayEmpty
      onChange={(event) => onChange(event.target.value as string)}
    >
      <MenuItem value="" disabled>
        {placeholder || "Select an option"}
      </MenuItem>
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  );
};

export default memo(SelectComponent, isEqual);
