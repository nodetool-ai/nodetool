/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Autocomplete, TextField } from "@mui/material";

const styles = { root: css`` };

const AutocompleteDemo = () => (
  <Autocomplete
    css={styles.root}
    options={[]}
    renderInput={(params) => <TextField {...params} label="Autocomplete" />}
  />
);

export default AutocompleteDemo;
