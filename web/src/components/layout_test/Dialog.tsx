/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Dialog } from "@mui/material";

const styles = { root: css`` };

const DialogDemo = () => (
  <Dialog open onClose={() => {}} css={styles.root}>
    Dialog
  </Dialog>
);

export default DialogDemo;
