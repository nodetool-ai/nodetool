/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Button } from "@mui/material";

const styles = { root: css`` };

const ButtonDemo = () => (
  <div css={styles.root}>
    <Button variant="text">Text</Button>
    <Button variant="contained">Contained</Button>
    <Button variant="outlined">Outlined</Button>
  </div>
);

export default ButtonDemo;
