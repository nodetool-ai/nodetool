/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Tabs, Tab } from "@mui/material";

const styles = { root: css`` };

const TabsDemo = () => (
  <Tabs css={styles.root} value={0} aria-label="demo tabs">
    <Tab label="Tab 1" value={0} />
  </Tabs>
);

export default TabsDemo;
