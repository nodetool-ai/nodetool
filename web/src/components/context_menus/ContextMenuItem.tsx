/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { ReactElement, ReactNode, memo } from "react";
import { Tooltip, MenuItem } from "@mui/material";
import { EditorButton } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface ContextMenuItemProps {
  onClick?: (event?: React.MouseEvent<HTMLElement>) => void;
  label?: string;
  IconComponent?: ReactElement;
  tooltip?: ReactNode;
  addButtonClassName?: string;
  controlElement?: ReactElement;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      color: theme.vars.palette.grey[0],
      transition: "all 0.2s ease-in-out"
    },
    "&:hover": {
      backgroundColor: "var(--palette-grey-800)"
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
      color: theme.vars.palette.grey[0],
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
      padding: "0.2em 1em",
      maxWidth: "unset",
      borderRadius: "0.2em",
      fontFamily: theme.fontFamily1,
      textTransform: "none",
      fontSize: theme.fontSizeNormal,
      fontWeight: 300,
      letterSpacing: "0.3px",
      color: "var(--palette-text-primary)",
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
      color: "var(--palette-text-secondary)"
    },
    ".checkbox": {
      marginLeft: 0
    },
    ".checkbox .MuiTypography-root": {
      margin: "0 0 0 0.6em",
      fontFamily: theme.fontFamily1
    },
    "&:hover button.action.delete svg": {
      color: theme.vars.palette.c_delete
    }
  });

const ContextMenuItem = memo(function ContextMenuItem({
  onClick,
  label,
  IconComponent,
  tooltip,
  addButtonClassName,
  controlElement
}: ContextMenuItemProps) {
  const theme = useTheme();
  return (
    <div className="context-menu-item" css={styles(theme)}>
      {tooltip && (
        <Tooltip
          css={styles(theme)}
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement={"right"}
        >
          <MenuItem>
            {controlElement ? (
              React.cloneElement(controlElement, { onClick })
            ) : (
              <EditorButton
                className={`action ${addButtonClassName || ""}`}
                onClick={onClick}
                density="normal"
              >
                {IconComponent}
                <span className="label">{label}</span>
              </EditorButton>
            )}
          </MenuItem>
        </Tooltip>
      )}
      {!tooltip && (
        <MenuItem>
          {controlElement ? (
            React.cloneElement(controlElement, { onClick })
          ) : (
            <EditorButton
              className={`action ${addButtonClassName || ""}`}
              onClick={onClick}
              density="normal"
            >
              {IconComponent}
              <span className="label">{label}</span>
            </EditorButton>
          )}
        </MenuItem>
      )}
    </div>
  );
});

export default ContextMenuItem;
