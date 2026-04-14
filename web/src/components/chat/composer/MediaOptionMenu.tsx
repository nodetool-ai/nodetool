/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import {
  Caption,
  FlexRow,
  Popover,
  Text
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

const styles = (theme: Theme) =>
  css({
    padding: "8px 0",
    ".option-menu-header": {
      padding: "8px 16px 4px",
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 1
    },
    ".option-menu-item": {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 16px",
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      transition: "background-color 120ms ease",
      "&:hover:not(.disabled)": {
        backgroundColor: "rgba(255,255,255,0.06)"
      },
      "&.selected": {
        backgroundColor: "rgba(255,255,255,0.04)"
      },
      "&.disabled": {
        opacity: 0.45,
        cursor: "not-allowed"
      }
    },
    ".option-menu-icon": {
      color: theme.vars.palette.grey[300],
      display: "inline-flex"
    },
    ".option-menu-check": {
      marginLeft: "auto",
      color: theme.vars.palette.primary.light,
      display: "inline-flex"
    }
  });

/**
 * Generic list-style popover used by several media composer chips
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
  const theme = useTheme();
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="top-center"
      paperSx={{
        backgroundColor: theme.vars.palette.grey[900],
        border: `1px solid ${theme.vars.palette.grey[800]}`,
        borderRadius: 2,
        minWidth,
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)"
      }}
    >
      <div css={styles(theme)} role="menu">
        {header && (
          <Caption className="option-menu-header" size="small">
            {header}
          </Caption>
        )}
        {options.map((opt) => {
          const selected = opt.id === value;
          return (
            <div
              key={String(opt.id)}
              role="menuitemradio"
              aria-checked={selected}
              aria-disabled={opt.disabled || undefined}
              className={`option-menu-item${selected ? " selected" : ""}${opt.disabled ? " disabled" : ""}`}
              onClick={() => {
                if (opt.disabled) {
                  return;
                }
                onChange(opt.id);
                onClose();
              }}
            >
              {opt.icon && (
                <span className="option-menu-icon">{opt.icon}</span>
              )}
              <FlexRow
                gap={0.5}
                align="center"
                sx={{ flex: 1, minWidth: 0 }}
              >
                <Text size="normal" weight={500} sx={{ color: "inherit" }}>
                  {opt.label}
                </Text>
                {opt.description && (
                  <Caption size="tiny" color="secondary">
                    {opt.description}
                  </Caption>
                )}
              </FlexRow>
              {selected && (
                <span className="option-menu-check">
                  <CheckIcon fontSize="small" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Popover>
  );
}

/**
 * Generic list-style popover used by several media composer chips
 * (duration, resolution, variations). Pure presentational — the caller
 * provides options + onChange + current value.
 */
const MediaOptionMenu = memo(MediaOptionMenuInternal) as typeof MediaOptionMenuInternal;

export default MediaOptionMenu;
