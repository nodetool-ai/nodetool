/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import React from "react";
import Button from "@mui/material/Button";
import ClearIcon from "@mui/icons-material/Clear";

interface CloseButtonProps<T> {
  className?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const styles = (theme: Theme) =>
  css({
    button: {
      position: "absolute",
      top: "0.5em",
      right: "0.5em",
      color: theme.vars.palette.grey[200]
    },
    "button:hover": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[0]
    }
  });

function CloseButton<T>({
  className = "",
  onClick
}: CloseButtonProps<T>): JSX.Element {
  const theme = useTheme();
  return (
    <div css={styles(theme)}>
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
