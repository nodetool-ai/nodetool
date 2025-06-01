/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Button, Popover, Typography } from "@mui/material";
import React from "react";

const styles = {
  root: css`
    margin: 8px;
  `,
  typography: css`
    padding: 16px; // Corresponds to theme.spacing(2)
  `
};

const PopoverDemo = () => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(
    null
  );

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;

  return (
    <div css={styles.root}>
      <Button aria-describedby={id} variant="contained" onClick={handleClick}>
        Open Popover
      </Button>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
      >
        <Typography css={styles.typography}>
          The content of the Popover.
        </Typography>
      </Popover>
    </div>
  );
};

export default PopoverDemo;
