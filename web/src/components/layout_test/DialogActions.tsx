/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { DialogActions, Button } from '@mui/material';

const styles = { root: css`` };

const DialogActionsDemo = () => (
  <DialogActions css={styles.root}>
    <Button>Ok</Button>
  </DialogActions>
);

export default DialogActionsDemo;
