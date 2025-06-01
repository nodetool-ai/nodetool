/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Menu } from "@mui/material";

const styles = { root: css`` };

const MenuDemo = () => (
  <Menu open anchorEl={document.body} css={styles.root}>
    Menu
  </Menu>
);

export default MenuDemo;
