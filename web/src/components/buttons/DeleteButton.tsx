/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import Button from "@mui/material/Button";
import ClearIcon from "@mui/icons-material/Clear";

interface DeleteButtonProps<T> {
  item?: T;
  className?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>, item: T) => void;
}

const styles = (theme: any) =>
  css({
    "button:hover svg": {
      color: theme.palette.c_delete,
    },
    button: {
      color: theme.palette.c_gray5,
    },
  });

function DeleteButton<T>({
  item,
  className = "",
  onClick,
}: DeleteButtonProps<T>): JSX.Element {
  return (
    <Button
      css={styles}
      className={`${className} delete-button`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e, item ? item : ({} as T));
      }}
    >
      <ClearIcon />
    </Button>
  );
}

export default DeleteButton;
