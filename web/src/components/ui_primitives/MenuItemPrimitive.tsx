/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MenuItem, ListItemIcon, ListItemText, Tooltip, Divider } from "@mui/material";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface MenuItemPrimitiveProps {
  /** Label text */
  label: string;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Click handler */
  onClick?: (event: React.MouseEvent) => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether the item is selected/active */
  selected?: boolean;
  /** Whether to show submenu indicator */
  hasSubmenu?: boolean;
  /** Secondary text */
  secondary?: string;
  /** Tooltip text */
  tooltip?: string;
  /** Keyboard shortcut to display */
  shortcut?: string;
  /** Color variant */
  color?: "default" | "error" | "primary";
  /** Dense mode */
  dense?: boolean;
  /** Divider before this item */
  dividerBefore?: boolean;
  /** Divider after this item */
  dividerAfter?: boolean;
  /** Additional className */
  className?: string;
}

const styles = (theme: Theme) => css`
  .menu-item-primitive {
    border-radius: 4px;
    margin: 2px 4px;
    padding: 8px 12px;
    transition: all 0.15s ease;
    
    &:hover {
      background-color: ${theme.vars.palette.action.hover};
    }
    
    &.Mui-selected {
      background-color: ${theme.vars.palette.action.selected};
      
      &:hover {
        background-color: ${theme.vars.palette.action.selected};
      }
    }
    
    &.error {
      color: ${theme.vars.palette.error.main};
      
      .MuiListItemIcon-root {
        color: ${theme.vars.palette.error.main};
      }
      
      &:hover {
        background-color: ${theme.vars.palette.error.main}1a;
      }
    }
    
    &.primary {
      color: ${theme.vars.palette.primary.main};
      
      .MuiListItemIcon-root {
        color: ${theme.vars.palette.primary.main};
      }
      
      &:hover {
        background-color: ${theme.vars.palette.primary.main}1a;
      }
    }
    
    .MuiListItemIcon-root {
      min-width: 32px;
      color: ${theme.vars.palette.text.secondary};
    }
    
    .MuiListItemText-primary {
      font-size: 14px;
    }
    
    .MuiListItemText-secondary {
      font-size: 12px;
    }
    
    .menu-item-end {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      padding-left: 16px;
    }
    
    .shortcut {
      font-size: 12px;
      color: ${theme.vars.palette.text.disabled};
      font-family: monospace;
      background: ${theme.vars.palette.action.hover};
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .submenu-icon {
      color: ${theme.vars.palette.text.disabled};
      font-size: 18px;
    }
    
    &.dense {
      padding: 6px 12px;
      
      .MuiListItemText-primary {
        font-size: 13px;
      }
    }
  }
`;

export const MenuItemPrimitive: React.FC<MenuItemPrimitiveProps> = ({
  label,
  icon,
  onClick,
  disabled = false,
  selected = false,
  hasSubmenu = false,
  secondary,
  tooltip,
  shortcut,
  color = "default",
  dense = false,
  dividerBefore = false,
  dividerAfter = false,
  className
}) => {
  const theme = useTheme();
  
  const menuItem = (
    <MenuItem
      className={`menu-item-primitive ${color} ${dense ? "dense" : ""} ${className || ""}`}
      onClick={onClick}
      disabled={disabled}
      selected={selected}
    >
      {icon && <ListItemIcon>{icon}</ListItemIcon>}
      <ListItemText 
        primary={label} 
        secondary={secondary}
      />
      {(shortcut || hasSubmenu) && (
        <span className="menu-item-end">
          {shortcut && <span className="shortcut">{shortcut}</span>}
          {hasSubmenu && <KeyboardArrowRightIcon className="submenu-icon" />}
        </span>
      )}
    </MenuItem>
  );
  
  const wrappedItem = tooltip ? (
    <Tooltip title={tooltip} enterDelay={TOOLTIP_ENTER_DELAY} placement="right">
      <span>{menuItem}</span>
    </Tooltip>
  ) : menuItem;
  
  return (
    <div css={styles(theme)}>
      {dividerBefore && <Divider sx={{ my: 0.5 }} />}
      {wrappedItem}
      {dividerAfter && <Divider sx={{ my: 0.5 }} />}
    </div>
  );
};

export default MenuItemPrimitive;
