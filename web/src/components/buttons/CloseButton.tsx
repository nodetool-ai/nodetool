/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import Button from "@mui/material/Button";
import ClearIcon from "@mui/icons-material/Clear";

interface CloseButtonProps<T> {
  className?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const styles = (theme: any) =>
  css({
    button: {
      position: "absolute",
      top: "0.5em",
      right: "0.5em",
      color: theme.palette.c_gray5
    },
    "button:hover": {
      backgroundColor: "transparent",
      color: theme.palette.c_white
    }
  });

function CloseButton<T>({
  className = "",
  onClick
}: CloseButtonProps<T>): JSX.Element {
  return (
    <div css={styles}>
      <Button
        className={`${className} close-button`}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
      >
        <ClearIcon />
      </Button>
    </div>
  );
}

export default CloseButton;
