/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import React, { memo, useCallback } from "react";
import Button from "@mui/material/Button";
import type { ButtonProps } from "@mui/material/Button";
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
  component?: ButtonProps["component"];
  onClick: (event: React.MouseEvent<HTMLElement>, item: T) => void;
}

const styles = (theme: Theme) =>
  css({
    "button:hover svg": {
      color: theme.vars.palette.c_delete
    },
    button: {
      color: theme.vars.palette.grey[200]
    },
    "&:hover": {
      color: theme.vars.palette.c_delete,
      backgroundColor: "transparent"
    }
  });

function DeleteButton<T>({
  item,
  className = "",
  tooltip,
  tooltipPlacement,
  component,
  onClick
}: DeleteButtonProps<T>): JSX.Element {
  const theme = useTheme();
  
  const handleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    onClick(e, item ? item : ({} as T));
  }, [onClick, item]);
  
  return (
    <Tooltip
      title={tooltip || ""}
      enterDelay={TOOLTIP_ENTER_DELAY * 2}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      placement={tooltipPlacement || "bottom"}
    >
      <Button
        component={component as any}
        css={styles(theme)}
        className={`${className} delete-button`}
        tabIndex={-1}
        onClick={handleClick}
      >
        <ClearIcon />
      </Button>
    </Tooltip>
  );
}

export default memo(DeleteButton);
