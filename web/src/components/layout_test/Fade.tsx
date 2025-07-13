/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Fade } from "@mui/material";

const styles = { root: css`` };

const FadeDemo = () => (
  <Fade in>
    <div css={styles.root}>Fade</div>
  </Fade>
);

export default FadeDemo;
