/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { ReactElement, ReactNode } from "react";
import { Tooltip, MenuItem, Button, IconButton } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface ContextMenuItemProps {
  onClick?: (event?: React.MouseEvent<HTMLElement>) => void;
  label?: string;
  IconComponent?: ReactElement;
  tooltip?: ReactNode;
  addButtonClassName?: string;
  controlElement?: ReactElement;
}

const styles = (theme: any) =>
  css({
    "&": {
      color: theme.palette.c_white,
      transition: "all 0.2s ease-in-out"
    },
    ".MuiMenuItem-root": {
      padding: 0
    },
    svg: {
      fontSize: theme.fontSizeNormal,
      transition: "transform 0.2s ease"
    },
    ul: {
      paddingLeft: 0,
      listStyleType: "none"
    },
    "li.MuiListSubheader-root": {
      color: theme.palette.c_white,
      fontSize: theme.fontSizeNormal,
      fontWeight: 500,
      letterSpacing: "0.3px",
      textAlign: "left"
    },
    "button.action": {
      display: "flex",
      alignItems: "center",
      width: "100%",
      margin: 0,
      padding: "0.5em 1em",
      maxWidth: "unset",
      borderRadius: "0.2em",
      fontFamily: theme.fontFamily1,
      textTransform: "none",
      fontSize: theme.fontSizeNormal,
      fontWeight: 500,
      letterSpacing: "0.3px",
      color: "rgba(255, 255, 255, 0.9)",
      textAlign: "left",
      justifyContent: "start",
      position: "relative",
      transition: "all 0.15s ease-out"
    },
    ".label": {
      display: "block",
      paddingLeft: "0.8em",
      transition: "all 0.15s ease"
    },
    "button.action:hover svg": {
      transform: "scale(1.2)"
    },
    "button.action.disabled": {
      cursor: "default",
      opacity: 0.5,
      color: "rgba(255, 255, 255, 0.5)"
    },
    ".checkbox": {
      marginLeft: 0
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
      {tooltip && (
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
                <span className="label">{label}</span>
              </Button>
            )}
          </MenuItem>
        </Tooltip>
      )}
      {!tooltip && (
        <MenuItem onClick={onClick}>
          {controlElement ? (
            controlElement
          ) : (
            <IconButton className={`action ${addButtonClassName || ""}`}>
              {IconComponent}
              <span className="label">{label}</span>
            </IconButton>
          )}
        </MenuItem>
      )}
    </div>
  );
};

export default ContextMenuItem;
