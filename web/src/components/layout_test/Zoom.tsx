/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { Zoom, Button } from '@mui/material';

const styles = { root: css`` };

const ZoomDemo = () => (
  <Zoom in>
    <Button css={styles.root}>Zoom</Button>
  </Zoom>
);

export default ZoomDemo;
