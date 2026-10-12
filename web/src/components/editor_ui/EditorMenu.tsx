/** @jsxImportSource @emotion/react */
/**
 * EditorMenu
 *
 * A Menu for editor/node UI. The theme styles every MUI menu surface and row
 * (see `menuStyles.ts`), so this only tags the slots with the editor classes.
 */

import { memo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { Menu, MenuItem, type MenuItemProps, type MenuProps } from "@mui/material";
import { editorUiClasses } from "../../constants/editorUiClasses";
import { cn } from "./editorUtils";

/** The subset of a MUI slot's props this menu reads back before merging. */
interface SlotPropsWithSx {
  sx?: SxProps<Theme>;
  className?: string;
}

export interface EditorMenuProps extends Omit<MenuProps, "slotProps"> {
  /**
   * Optional sx for the Paper slot.
   * Prefer this over global CSS for portal-safe styling.
   */
  paperSx?: SxProps<Theme>;
  /**
   * Optional sx for the List slot.
   */
  listSx?: SxProps<Theme>;
  /**
   * Advanced: pass through slotProps (merged with defaults).
   */
  slotProps?: MenuProps["slotProps"];
}

export const EditorMenu = memo(function EditorMenu({
  paperSx,
  listSx,
  slotProps,
  ...props
}: EditorMenuProps) {
  const paperSlot = (slotProps?.paper ?? {}) as SlotPropsWithSx;
  const listSlot = (slotProps?.list ?? {}) as SlotPropsWithSx;

  return (
    <Menu
      {...props}
      slotProps={{
        ...slotProps,
        paper: {
          ...paperSlot,
          className: cn(
            editorUiClasses.menuPaper,
            paperSlot.className
          ),
          sx: {
            ...paperSx,
            ...(paperSlot.sx as object | undefined)
          }
        },
        list: {
          ...listSlot,
          className: cn(
            editorUiClasses.menuList,
            listSlot.className
          ),
          sx: {
            ...(listSx as object | undefined),
            ...(listSlot.sx as object | undefined)
          }
        }
      }}
    />
  );
});

export interface EditorMenuItemProps extends Omit<MenuItemProps, "dense"> {
  /**
   * Keep menu density consistent across editor menus.
   */
  dense?: boolean;
}

export const EditorMenuItem = memo(function EditorMenuItem({
  dense = true,
  ...props
}: EditorMenuItemProps) {
  return (
    <MenuItem
      dense={dense}
      {...props}
      className={cn(editorUiClasses.menuItem, props.className)}
    />
  );
});


