/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Popover } from "@mui/material";

const styles = { root: css`` };

const PopoverDemo = () => (
  <Popover open anchorEl={document.body} css={styles.root}>
    <div>Popover</div>
  </Popover>
);

export default PopoverDemo;
