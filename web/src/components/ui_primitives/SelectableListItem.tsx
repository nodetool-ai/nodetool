/**
 * SelectableListItem Component
 *
 * A clickable row with a left border indicator, selection highlight, and
 * a dashed secondary-state (e.g. comparison target). Replaces the hand-rolled
 * `ListItemButton` + custom hover/border recipes duplicated across
 * version/collection/asset/model list items.
 */

import React, { memo, forwardRef } from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export type SelectableListItemState = "default" | "selected" | "secondary";

export interface SelectableListItemProps extends Omit<BoxProps, "onClick"> {
  /** Whether the row is currently selected (solid primary border + tint). */
  selected?: boolean;
  /**
   * Whether the row is marked in a secondary state (dashed secondary border
   * + subtle tint). Typical use: compare-against targets, pinned rows.
   */
  secondary?: boolean;
  /** Whether the row is disabled / in-progress (reduces opacity, no hover). */
  disabled?: boolean;
  /** Click handler */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** Additional horizontal padding (theme units). Default: 1 */
  paddingX?: number;
  /** Additional vertical padding (theme units). Default: 0.5 */
  paddingY?: number;
  /** Flex gap between children (theme units). Default: 1 */
  gap?: number;
  /** ARIA role. Default: "button" if onClick, else undefined. */
  role?: string;
}

const BORDER_WIDTH = 3;

/**
 * SelectableListItem - Row with selection indicator and hover state
 *
 * @example
 * <SelectableListItem
 *   selected={item.id === activeId}
 *   secondary={item.id === compareAgainst}
 *   disabled={isBusy}
 *   onClick={() => select(item.id)}
 * >
 *   <Thumbnail />
 *   <RowContent />
 *   <HoverActionGroup>
 *     <DeleteButton />
 *   </HoverActionGroup>
 * </SelectableListItem>
 */
export const SelectableListItem = memo(
  forwardRef<HTMLDivElement, SelectableListItemProps>(function SelectableListItem(
    {
      selected = false,
      secondary = false,
      disabled = false,
      onClick,
      paddingX = 1,
      paddingY = 0.5,
      gap = 1,
      role,
      sx,
      children,
      ...props
    },
    ref
  ) {
    const theme = useTheme();

    const borderColor = selected
      ? theme.vars.palette.primary.main
      : secondary
      ? theme.vars.palette.secondary.main
      : "transparent";

    const borderStyle = secondary && !selected ? "dashed" : "solid";

    const background = selected
      ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
      : secondary
      ? `rgba(${theme.vars.palette.action.hoverChannel} / 0.04)`
      : "transparent";

    const interactive = Boolean(onClick) && !disabled;

    return (
      <Box
        ref={ref}
        onClick={disabled ? undefined : onClick}
        role={role ?? (onClick ? "button" : undefined)}
        tabIndex={interactive ? 0 : undefined}
        aria-disabled={disabled || undefined}
        aria-pressed={onClick ? selected : undefined}
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: theme.spacing(gap),
          paddingInline: theme.spacing(paddingX),
          paddingBlock: theme.spacing(paddingY),
          cursor: interactive ? "pointer" : "default",
          opacity: disabled ? 0.6 : 1,
          borderLeft: `${BORDER_WIDTH}px ${borderStyle} ${borderColor}`,
          backgroundColor: background,
          transition:
            "background-color 120ms ease, border-color 120ms ease",
          "&:hover":
            interactive && !selected && !secondary
              ? {
                  backgroundColor: theme.vars.palette.action.hover
                }
              : undefined,
          "&:focus-visible": interactive
            ? {
                outline: `2px solid ${theme.vars.palette.primary.main}`,
                outlineOffset: -2
              }
            : undefined,
          ...sx
        }}
        {...props}
      >
        {children}
      </Box>
    );
  })
);

SelectableListItem.displayName = "SelectableListItem";
