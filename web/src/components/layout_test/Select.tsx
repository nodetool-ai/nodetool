/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Select, MenuItem } from "@mui/material";
import React from "react";

const styles = { root: css`` };

const SelectDemo = () => {
  const [value, setValue] = React.useState("1");

  const handleChange = (event: any) => {
    setValue(event.target.value as string);
  };

  return (
    <Select
      css={styles.root}
      value={value}
      onChange={handleChange}
      displayEmpty
    >
      <MenuItem value="">
        <em>None</em>
      </MenuItem>
      <MenuItem value={"1"}>Option 1</MenuItem>
      <MenuItem value={"2"}>Option 2</MenuItem>
      <MenuItem value={"3"}>Option 3</MenuItem>
    </Select>
  );
};

export default SelectDemo;
