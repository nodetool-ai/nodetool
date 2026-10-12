import React, { ReactElement, ReactNode, memo } from "react";

import { MenuItemPrimitive } from "../ui_primitives";

interface ContextMenuItemProps {
  onClick?: (event?: React.MouseEvent<HTMLElement>) => void;
  /** Sentence-case label */
  label: string;
  IconComponent?: ReactElement;
  /** Longer explanation, shown to the right of the row on hover */
  tooltip?: ReactNode;
  disabled?: boolean;
  /** Delete, remove: renders the row in `error.main` */
  destructive?: boolean;
  /** The row opens a submenu */
  hasSubmenu?: boolean;
  /** Keyboard shortcut shown at the end of the row */
  shortcut?: string;
  /** Class for tests and targeting */
  className?: string;
}

/**
 * A row of an editor context menu: a `MenuItemPrimitive` with an optional rich
 * tooltip. Every editor context menu builds its rows from this, so they share
 * the menu row style from `menuStyles.ts`.
 */
const ContextMenuItem = memo(function ContextMenuItem({
  onClick,
  label,
  IconComponent,
  tooltip,
  disabled = false,
  destructive = false,
  hasSubmenu = false,
  shortcut,
  className
}: ContextMenuItemProps) {
  return (
    <MenuItemPrimitive
      label={label}
      icon={IconComponent}
      onClick={onClick}
      disabled={disabled}
      color={destructive ? "error" : "default"}
      hasSubmenu={hasSubmenu}
      shortcut={shortcut}
      tooltip={tooltip}
      className={className}
    />
  );
});

export default ContextMenuItem;
