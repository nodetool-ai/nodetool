/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Tooltip } from "@mui/material";

const styles = { root: css`` };

const TooltipDemo = () => (
  <Tooltip title="Tooltip">
    <span css={styles.root}>Hover me</span>
  </Tooltip>
);

export default TooltipDemo;
