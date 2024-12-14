/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { ReactElement, ReactNode } from "react";
import { Tooltip, MenuItem, Button } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";

interface ContextMenuItemProps {
  onClick?: (event?: React.MouseEvent<HTMLElement>) => void;
  label?: string;
  IconComponent?: ReactElement;
  tooltip: ReactNode;
  addButtonClassName?: string;
  controlElement?: ReactElement;
}

const styles = (theme: any) =>
  css({
    "&": {
      color: theme.palette.c_white
    },
    ul: {
      paddingLeft: "1.2em",
      listStyleType: "square",
      padding: 0
    },
    li: {
      margin: 0
    },
    "button.action": {
      width: "calc(100% + 20px)",
      maxWidth: "unset",
      fontFamily: theme.fontFamily1,
      textTransform: "none",
      fontSize: theme.fontSizeLarge,
      backgroundColor: "transparent",
      color: theme.palette.c_white,
      textAlign: "left",
      justifyContent: "start",
      padding: "0.1em 0.1em 0.1em 1.5em",
      // margin: 0,
      position: "relative",
      "&:hover, &:focus": {
        color: theme.palette.c_white
      }
    },
    "button.action:hover, span:hover": {
      color: theme.palette.c_gray4
    },
    "button.action.disabled": {
      cursor: "default",
      color: theme.palette.c_gray4
    },
    "button.action svg, span svg": {
      position: "absolute",
      left: "-0.3em",
      padding: "2px",
      top: "2px",
      color: theme.palette.c_white
    },
    "button.action.delete:hover": {
      color: theme.palette.c_delete
    },
    ".checkbox": {
      marginLeft: 0
    },
    ".checkbox span svg": {
      left: "-0.3em",
      top: "-12px"
    },
    ".checkbox .MuiTypography-root": {
      margin: "0 0 0 0.6em",
      fontFamily: theme.fontFamily1
    }
  });

const ContextMenuItem: React.FC<ContextMenuItemProps> = ({
  onClick,
  label,
  IconComponent,
  tooltip,
  addButtonClassName,
  controlElement
}) => {
  return (
    <div className="context-menu-item" css={styles}>
      <Tooltip
        css={styles}
        title={tooltip}
        enterDelay={TOOLTIP_ENTER_DELAY}
        placement={"right"}
      >
        <MenuItem onClick={onClick}>
          {controlElement ? (
            controlElement
          ) : (
            <Button className={`action ${addButtonClassName || ""}`}>
              {IconComponent}
              {label}
            </Button>
          )}
        </MenuItem>
      </Tooltip>
    </div>
  );
};

export default ContextMenuItem;
