/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Select, MenuItem } from "@mui/material";

const styles = { root: css`` };

const SelectDemo = () => (
  <Select css={styles.root} value={10}>
    <MenuItem value={10}>Ten</MenuItem>
    <MenuItem value={20}>Twenty</MenuItem>
    <MenuItem value={30}>Thirty</MenuItem>
  </Select>
);

export default SelectDemo;
