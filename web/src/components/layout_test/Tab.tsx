/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Tabs, Tab } from "@mui/material";

const styles = { root: css`` };

const TabDemo = () => (
  <Tabs value={0} aria-label="demo single tab" css={styles.root}>
    <Tab label="Tab" value={0} />
  </Tabs>
);

export default TabDemo;
