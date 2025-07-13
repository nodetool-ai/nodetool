/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import React from "react";
import Button from "@mui/material/Button";
import ClearIcon from "@mui/icons-material/Clear";
import { Tooltip } from "@mui/material";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";

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

const styles = (theme: Theme) =>
  css({
    "button:hover svg": {
      color: theme.palette.c_delete
    },
    button: {
      color: theme.palette.grey[200]
    },
    "&:hover": {
      color: theme.palette.c_delete,
      backgroundColor: "transparent"
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
      enterDelay={TOOLTIP_ENTER_DELAY * 2}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      placement={tooltipPlacement || "bottom"}
    >
      <Button
        css={styles}
        className={`${className} delete-button`}
        tabIndex={-1}
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
