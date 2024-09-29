/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import Button from "@mui/material/Button";
import ClearIcon from "@mui/icons-material/Clear";
import { Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";

interface DeleteButtonProps<T> {
  item?: T;
  className?: string;
  tooltip?: string;
  tooltipPlacement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "bottom-end"
    | "bottom-start"
    | "left-end"
    | "left-start"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start";
  onClick: (event: React.MouseEvent<HTMLButtonElement>, item: T) => void;
}

const styles = (theme: any) =>
  css({
    "button:hover svg": {
      color: theme.palette.c_delete
    },
    button: {
      color: theme.palette.c_gray5
    }
  });

function DeleteButton<T>({
  item,
  className = "",
  tooltip,
  tooltipPlacement,
  onClick
}: DeleteButtonProps<T>): JSX.Element {
  return (
    <Tooltip
      title={tooltip || ""}
      placement={tooltipPlacement || "bottom"}
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
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
    </Tooltip>
  );
}

export default DeleteButton;
