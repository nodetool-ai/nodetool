/**
 * DockTabStrip
 *
 * The tab strip on top of a docked panel group, as engine editors draw it:
 * compact tabs that name the panels in the group, the active one lifted onto
 * the panel surface. A tab is dragged to re-dock its panel, right-clicked for
 * its menu, and closed with its close button or a middle click.
 *
 * The strip reports gestures and leaves docking to its host: `onTabDragStart`
 * fires once the pointer has travelled past a small threshold, so a click
 * still activates the tab.
 *
 * Keyboard: Left/Right/Home/End move between tabs and activate them, Delete
 * closes the focused tab, and Shift+F10 or the context-menu key opens its
 * menu.
 */

import React, { forwardRef, memo, useRef } from "react";
import type { ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";

import { Box } from "./Box";
import { FlexRow } from "./FlexRow";
import { Tooltip } from "./Tooltip";
import { focusRing } from "./selectionStyles";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, CONTROL, FONT_SIZE_SANS, MOTION, TYPOGRAPHY, reducedMotion, thinScrollbarStyles } from "./tokens";

/** Strip height. Matches the small control height so a tab reads as a control. */
export const DOCK_TAB_HEIGHT = CONTROL.height.sm;
/** Pointer travel, in px, before a press on a tab becomes a drag. */
export const DOCK_TAB_DRAG_THRESHOLD = 4;

export interface DockTab {
  /** Stable id, reported back by every callback. */
  id: string;
  /** Tab label, sentence case. */
  label: string;
  /** Optional 14px leading icon. */
  icon?: ReactNode;
  /** Shows a close button on the tab. Defaults to true when `onClose` is set. */
  closable?: boolean;
}

export interface DockTabStripProps {
  tabs: readonly DockTab[];
  activeId: string;
  /** Accessible name of the tab list, e.g. "Left panel tabs". */
  ariaLabel: string;
  onActivate: (id: string) => void;
  /** Closes a tab. Omit it to draw tabs without close buttons. */
  onClose?: (id: string) => void;
  /** Starts a drag once the pointer passes {@link DOCK_TAB_DRAG_THRESHOLD}. */
  onTabDragStart?: (id: string, event: PointerEvent) => void;
  /** Opens the tab's menu at a viewport position. */
  onTabContextMenu?: (id: string, position: { x: number; y: number }) => void;
  /** Draws an insertion caret before the tab at this index (or after the last one). */
  dropIndex?: number | null;
  /** Whether this group has focus within it. Tints the active tab's accent. */
  focused?: boolean;
  /** Right-aligned controls, such as the group menu button. */
  actions?: ReactNode;
  /** Id prefix linking each tab to its panel through `aria-controls`. */
  panelIdPrefix?: string;
  sx?: SxProps<Theme>;
}

/** Id of the tab element for `id`, for `aria-labelledby` on the panel. */
export const dockTabElementId = (prefix: string, id: string): string => `${prefix}-tab-${id}`;

const DockTabStripBase = forwardRef<HTMLDivElement, DockTabStripProps>(function DockTabStrip({
  tabs, activeId, ariaLabel, onActivate, onClose, onTabDragStart, onTabContextMenu, dropIndex = null,
  focused = false, actions, panelIdPrefix, sx
}, ref) {
  const theme = useTheme();
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const press = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const focusTab = (index: number): void => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) { return; }
    onActivate(tab.id);
    tabRefs.current.get(tab.id)?.focus();
  };
  const openMenuAtTab = (id: string): void => {
    const rect = tabRefs.current.get(id)?.getBoundingClientRect();
    if (rect) { onTabContextMenu?.(id, { x: rect.left, y: rect.bottom }); }
  };

  const caret = (key: string): ReactNode => <Box key={key} aria-hidden data-dock-drop-caret
    sx={{ width: "2px", alignSelf: "stretch", my: SPACING.xs, flexShrink: 0, bgcolor: "primary.main", borderRadius: BORDER_RADIUS.pill }} />;

  return <FlexRow ref={ref} align="stretch" data-dock-tabstrip sx={[{
    flexShrink: 0, height: DOCK_TAB_HEIGHT, minWidth: 0, boxSizing: "border-box",
    borderBottom: `1px solid ${theme.vars.palette.divider}`, bgcolor: "background.default", userSelect: "none"
  }, ...(Array.isArray(sx) ? sx : [sx])]}>
    <FlexRow role="tablist" aria-label={ariaLabel} align="stretch" sx={{
      flex: 1, minWidth: 0, overflowX: "auto", overflowY: "hidden", ...thinScrollbarStyles(theme),
      "&::-webkit-scrollbar": { height: 0 }
    }}>
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        const closable = Boolean(onClose) && tab.closable !== false;
        return <React.Fragment key={tab.id}>
          {dropIndex === index && caret(`caret-${tab.id}`)}
          <FlexRow
            ref={(node: HTMLDivElement | null) => { if (node) { tabRefs.current.set(tab.id, node); } else { tabRefs.current.delete(tab.id); } }}
            role="tab"
            id={panelIdPrefix ? dockTabElementId(panelIdPrefix, tab.id) : undefined}
            aria-selected={active}
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-panel` : undefined}
            tabIndex={active ? 0 : -1}
            data-dock-tab={tab.id}
            align="center"
            gap={SPACING.sm}
            onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
              if (event.button === 1) { event.preventDefault(); return; }
              if (event.button !== 0) { return; }
              // A press must not pull focus out of the panel being dragged; a plain click focuses the tab below.
              event.preventDefault();
              dragged.current = false;
              press.current = { id: tab.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
              // Capture, so the press keeps reporting moves after the pointer leaves the tab.
              if (onTabDragStart) { event.currentTarget.setPointerCapture?.(event.pointerId); }
              onActivate(tab.id);
            }}
            onPointerMove={(event: React.PointerEvent<HTMLDivElement>) => {
              const current = press.current;
              if (!current || current.pointerId !== event.pointerId || !onTabDragStart) { return; }
              if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < DOCK_TAB_DRAG_THRESHOLD) { return; }
              press.current = null;
              dragged.current = true;
              onTabDragStart(current.id, event.nativeEvent);
            }}
            onClick={(event: React.MouseEvent<HTMLDivElement>) => {
              if (!dragged.current) { event.currentTarget.focus(); onActivate(tab.id); }
              dragged.current = false;
            }}
            onPointerUp={() => { press.current = null; }}
            onPointerCancel={() => { press.current = null; }}
            onAuxClick={(event: React.MouseEvent<HTMLDivElement>) => {
              if (event.button === 1 && closable) { event.preventDefault(); onClose?.(tab.id); }
            }}
            onContextMenu={(event: React.MouseEvent<HTMLDivElement>) => {
              if (!onTabContextMenu) { return; }
              event.preventDefault();
              onActivate(tab.id);
              onTabContextMenu(tab.id, { x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "ArrowRight") { event.preventDefault(); focusTab(index + 1); }
              else if (event.key === "ArrowLeft") { event.preventDefault(); focusTab(index - 1); }
              else if (event.key === "Home") { event.preventDefault(); focusTab(0); }
              else if (event.key === "End") { event.preventDefault(); focusTab(tabs.length - 1); }
              else if ((event.key === "Delete" || event.key === "Backspace") && closable) { event.preventDefault(); onClose?.(tab.id); }
              else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) { event.preventDefault(); openMenuAtTab(tab.id); }
              else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(tab.id); }
            }}
            sx={{
              position: "relative", flexShrink: 0, maxWidth: 200, minWidth: 0, cursor: "default", touchAction: "none",
              paddingInline: getSpacingPx(SPACING.md), paddingRight: closable ? getSpacingPx(SPACING.xs) : undefined,
              ...TYPOGRAPHY.sans.label,
              color: active ? "text.primary" : "text.secondary",
              bgcolor: active ? "background.paper" : "transparent",
              borderRight: `1px solid ${theme.vars.palette.divider}`,
              // The active tab sits on the panel surface: it covers the strip's divider below it.
              marginBottom: active ? "-1px" : 0,
              transition: MOTION.background,
              ...reducedMotion({ transition: MOTION.none }),
              "&::before": active ? {
                content: "\"\"", position: "absolute", insetInline: 0, top: 0, height: "2px",
                bgcolor: focused ? "primary.main" : "action.disabled"
              } : undefined,
              "&:hover": active ? undefined : { bgcolor: "action.hover", color: "text.primary" },
              "&:focus-visible": focusRing(theme),
              "& .dock-tab-icon": { display: "inline-flex", flexShrink: 0, color: active ? "primary.main" : "inherit", "& svg": { fontSize: FONT_SIZE_SANS.body } },
              "& .dock-tab-close": { visibility: active ? "visible" : "hidden" },
              "&:hover .dock-tab-close, &:focus-visible .dock-tab-close": { visibility: "visible" }
            }}
          >
            {tab.icon && <span className="dock-tab-icon" aria-hidden>{tab.icon}</span>}
            <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.label}</Box>
            {closable && <Tooltip title={`Close ${tab.label}`}><Box component="button" type="button" className="dock-tab-close" tabIndex={-1}
              aria-label={`Close ${tab.label}`}
              onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
              onClick={(event: React.MouseEvent) => { event.stopPropagation(); onClose?.(tab.id); }}
              sx={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                width: CONTROL.height.xs - 8, height: CONTROL.height.xs - 8, p: 0, border: 0, cursor: "pointer",
                borderRadius: BORDER_RADIUS.sm, bgcolor: "transparent", color: "text.secondary",
                "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                "& svg": { fontSize: FONT_SIZE_SANS.caption }
              }}>
              <CloseIcon />
            </Box></Tooltip>}
          </FlexRow>
        </React.Fragment>;
      })}
      {dropIndex !== null && dropIndex >= tabs.length && caret("caret-end")}
      {/* The empty end of the strip is a drop target too. */}
      <Box data-dock-tabstrip-end sx={{ flex: 1, minWidth: SPACING.xxl }} />
    </FlexRow>
    {actions && <FlexRow align="center" gap={SPACING.micro} sx={{ flexShrink: 0, px: SPACING.xs }}>{actions}</FlexRow>}
  </FlexRow>;
});

export const DockTabStrip = memo(DockTabStripBase);
DockTabStrip.displayName = "DockTabStrip";
