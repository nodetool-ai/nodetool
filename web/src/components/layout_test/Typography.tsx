/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Typography } from "@mui/material";

const styles = { root: css`` };

const TypographyDemo = () => (
  <div css={styles.root}>
    <Typography variant="h1">h1. Heading</Typography>
    <Typography variant="h2">h2. Heading</Typography>
    <Typography variant="body1">Body1 text</Typography>
  </div>
);

export default TypographyDemo;
