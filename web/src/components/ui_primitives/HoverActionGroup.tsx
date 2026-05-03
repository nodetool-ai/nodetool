/**
 * HoverActionGroup Component
 *
 * A container whose children fade in on hover of a configurable ancestor.
 * Replaces the inline `<style>{...}</style>` + `opacity: 0 → 1` transition
 * recipe used in list items, cards, and row-level action toolbars.
 *
 * By default, children are revealed when the immediate parent is hovered.
 * Provide `triggerSelector` to anchor the reveal to a named ancestor class
 * (e.g. ".my-row:hover") when the parent relationship is less direct.
 */

import React, { memo } from "react";
import { Box, BoxProps } from "@mui/material";

export interface HoverActionGroupProps extends Omit<BoxProps, "component"> {
  /**
   * Selector for the ancestor whose `:hover` reveals the group, e.g.
   * ".version-list-item:hover". When omitted, reveal triggers on the
   * immediate parent's `:hover`.
   */
  triggerSelector?: string;
  /** Gap between action items (theme spacing units). Default: 0.5 */
  gap?: number;
  /** Transition duration in ms. Default: 150 */
  transitionMs?: number;
  /** Always show regardless of hover (useful for pinned/active states). */
  alwaysVisible?: boolean;
  /** Keep revealed while focus is within the group. Default: true */
  revealOnFocusWithin?: boolean;
}

/**
 * HoverActionGroup - Actions revealed on ancestor hover
 *
 * @example
 * // Reveal icons when hovering the parent row
 * <ListItem>
 *   <ListItemText primary="…" />
 *   <HoverActionGroup>
 *     <EditButton />
 *     <DeleteButton />
 *   </HoverActionGroup>
 * </ListItem>
 *
 * @example
 * // Reveal when a named ancestor is hovered
 * <div className="card-row">
 *   <HoverActionGroup triggerSelector=".card-row:hover">
 *     <CopyButton />
 *   </HoverActionGroup>
 * </div>
 */
export const HoverActionGroup: React.FC<HoverActionGroupProps> = memo(
  function HoverActionGroup({
    triggerSelector,
    gap = 0.5,
    transitionMs = 150,
    alwaysVisible = false,
    revealOnFocusWithin = true,
    sx,
    children,
    ...props
  }) {
    const revealStyles: Record<string, { opacity: number }> = {};
    if (!alwaysVisible) {
      const trigger = triggerSelector ?? "*:hover >";
      revealStyles[`${trigger} &`] = { opacity: 1 };
      if (revealOnFocusWithin) {
        revealStyles["&:focus-within"] = { opacity: 1 };
      }
    }

    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          gap,
          opacity: alwaysVisible ? 1 : 0,
          transition: `opacity ${transitionMs}ms ease`,
          ...revealStyles,
          ...sx
        }}
        {...props}
      >
        {children}
      </Box>
    );
  }
);

HoverActionGroup.displayName = "HoverActionGroup";
