import React from "react";
import { useTheme } from "@mui/material/styles";
import { Box, MenuItem, ListItemIcon, ListItemText, Divider } from "@mui/material";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Tooltip } from "./Tooltip";
import {
  MENU_ICON_SIZE,
  menuItemDestructiveStyles,
  menuShortcutStyles
} from "./menuStyles";

export interface MenuItemPrimitiveProps {
  /** Label text, sentence case */
  label: string;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Click handler */
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether the item is selected/active */
  selected?: boolean;
  /** Whether to show submenu indicator */
  hasSubmenu?: boolean;
  /** Secondary text */
  secondary?: string;
  /** Tooltip shown to the right of the row */
  tooltip?: React.ReactNode;
  /** Keyboard shortcut to display */
  shortcut?: string;
  /**
   * Color variant. `error` marks a destructive item (delete, remove).
   * `primary` marks the one accent action in a menu.
   */
  color?: "default" | "error" | "primary";
  /** Divider before this item */
  dividerBefore?: boolean;
  /** Divider after this item */
  dividerAfter?: boolean;
  /** Additional className */
  className?: string;
  /** Test id on the row */
  "data-testid"?: string;
}

/**
 * One row of a menu. The theme gives every MUI `MenuItem` the shared menu row
 * style (`menuItemStyles`), so this only lays out the icon, label, secondary
 * line, shortcut and submenu chevron.
 *
 * It renders the row and its dividers as siblings, with no wrapper element,
 * so the menu's arrow-key navigation reaches every row.
 */
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
  dividerBefore = false,
  dividerAfter = false,
  className,
  "data-testid": testId
}) => {
  const theme = useTheme();

  const menuItem = (
    <MenuItem
      className={["menu-item-primitive", color, className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      selected={selected}
      data-testid={testId}
      sx={[
        color === "error" && menuItemDestructiveStyles(theme),
        color === "primary" && {
          color: theme.vars.palette.primary.main,
          "& .MuiListItemIcon-root": { color: theme.vars.palette.primary.main }
        }
      ]}
    >
      {icon && <ListItemIcon>{icon}</ListItemIcon>}
      <ListItemText primary={label} secondary={secondary} />
      {shortcut && (
        <Box component="span" className="shortcut" sx={menuShortcutStyles(theme)}>
          {shortcut}
        </Box>
      )}
      {hasSubmenu && (
        <KeyboardArrowRightIcon
          className="submenu-icon"
          sx={{
            marginLeft: shortcut ? 0 : "auto",
            fontSize: MENU_ICON_SIZE,
            color: theme.vars.palette.text.secondary
          }}
        />
      )}
    </MenuItem>
  );

  const wrappedItem = tooltip ? (
    <Tooltip title={tooltip} delay={TOOLTIP_ENTER_DELAY} placement="right">
      {disabled ? <span>{menuItem}</span> : menuItem}
    </Tooltip>
  ) : (
    menuItem
  );

  return (
    <>
      {dividerBefore && <Divider />}
      {wrappedItem}
      {dividerAfter && <Divider />}
    </>
  );
};

export default MenuItemPrimitive;
