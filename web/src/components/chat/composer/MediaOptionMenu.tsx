import React, { memo } from "react";
import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive
} from "../../ui_primitives";

export interface MediaOption<T extends string | number> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

interface MediaOptionMenuProps<T extends string | number> {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  header?: string;
  value: T;
  options: MediaOption<T>[];
  onChange: (value: T) => void;
  minWidth?: number;
}

/**
 * Generic option menu used by several media composer chips
 * (duration, resolution, variations). Pure presentational — the caller
 * provides options + onChange + current value.
 */
function MediaOptionMenuInternal<T extends string | number>({
  anchorEl,
  open,
  onClose,
  header,
  value,
  options,
  onChange,
  minWidth = 200
}: MediaOptionMenuProps<T>) {
  return (
    <ContextMenu
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      minWidth={minWidth}
    >
      {header && <ListSubheader>{header}</ListSubheader>}
      {options.map((opt) => {
        const selected = opt.id === value;
        return (
          <MenuItemPrimitive
            key={String(opt.id)}
            label={opt.label}
            secondary={opt.description}
            icon={opt.icon}
            checkable="radio"
            checked={selected}
            disabled={opt.disabled}
            onClick={() => {
              onChange(opt.id);
              onClose();
            }}
          />
        );
      })}
    </ContextMenu>
  );
}

const MediaOptionMenu = memo(MediaOptionMenuInternal) as typeof MediaOptionMenuInternal;

export default MediaOptionMenu;
