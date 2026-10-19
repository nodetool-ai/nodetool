import { useCallback, useId, useState, type ReactNode } from "react";
import type { StoreApi } from "zustand";
import { useTranslation } from "react-i18next";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import VerticalSplitOutlinedIcon from "@mui/icons-material/VerticalSplitOutlined";
import AddIcon from "@mui/icons-material/AddOutlined";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";

import type { DockLayoutState } from "../../stores/dock/DockLayoutStore";
import { DOCK_REGIONS, type DockLayoutGroup, type DockRegion } from "../../stores/dock/DockLayout";
import { Box, ContextMenu, DockDropOverlay, DockTabStrip, FlexColumn, MenuItemPrimitive, ToolbarIconButton, dockTabElementId } from "../ui_primitives";
import type { DockPresentation } from "./useDockPresentation";
import type { DockDrag } from "./DockCanvas";
import { DOCK_REGION_AXIS, dockDropAction, dockMoveToRegion } from "./dockTargets";

interface DockGroupProps {
  readonly group: DockLayoutGroup;
  readonly region: DockRegion;
  readonly presentation: DockPresentation;
  readonly store: StoreApi<DockLayoutState>;
  readonly setSlot: (id: string, slot: HTMLElement | null) => void;
  readonly drag?: DockDrag | null;
  readonly onDragStart?: (panelId: string, event: PointerEvent) => void;
  readonly maximized?: boolean;
  readonly onToggleMaximize?: () => void;
}

type MenuState = { readonly panelId: string; readonly position: { x: number; y: number } } | null;

export function DockGroup({ group, region, presentation, store, setSlot, drag = null, onDragStart, maximized = false,
  onToggleMaximize }: DockGroupProps): ReactNode {
  const { t } = useTranslation();
  const { metadata } = presentation;
  const { model } = store.getState();
  const required = new Set(model.requiredPanels);
  const idPrefix = `dock-${useId().replace(/:/g, "")}`;
  const visible = (id: string): boolean => metadata.availableIds.includes(id) && !metadata.layout.hidden.includes(id);
  const eligible = group.panels.filter(visible);
  const active = eligible.includes(group.activePanelId) ? group.activePanelId : eligible[0];
  const [menu, setMenu] = useState<MenuState>(null);
  const [focused, setFocused] = useState(false);
  const slotRef = useCallback((slot: HTMLElement | null) => setSlot(group.id, slot), [group.id, setSlot]);
  if (!active) { return null; }
  const title = (id: string): string => metadata.registry.find((entry) => entry.id === id)?.title ?? id;
  const icon = (id: string): ReactNode => metadata.registry.find((entry) => entry.id === id)?.icon;
  const dispatch = store.getState().dispatch;
  const target = drag?.target && drag.target.kind !== "region" && drag.target.groupId === group.id ? drag.target : null;
  // The strip shows the dragged tab too, so map the caret from "among the other tabs" to the drawn tabs.
  const dropIndex = target?.kind === "tab" ? (() => {
    const others = eligible.filter((id) => id !== drag?.panelId);
    const before = others[target.index];
    return before === undefined ? eligible.length : eligible.indexOf(before);
  })() : null;
  const hiddenPanels = metadata.registry.filter((entry) => metadata.availableIds.includes(entry.id) && metadata.layout.hidden.includes(entry.id));
  const closeMenu = (): void => setMenu(null);
  const menuPanel = menu?.panelId ?? active;
  const menuIndex = eligible.indexOf(menuPanel);
  const axis = DOCK_REGION_AXIS[region];
  const run = (action: () => void): void => { closeMenu(); action(); };
  const reorder = (offset: -1 | 1): void => {
    const action = dockDropAction(store.getState().layout, menuPanel,
      { kind: "tab", region, groupId: group.id, index: menuIndex + offset }, visible);
    if (action) { dispatch(action); }
  };

  return <FlexColumn data-dock-region={region} data-dock-group={group.id}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); } }}
    sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden", bgcolor: "background.paper" }}>
    <DockTabStrip ariaLabel={t("batch2_2.dock.panelTabs", { region: t(`batch2_2.dock.regions.${region}`), editor: model.editorLabel })} panelIdPrefix={idPrefix} focused={focused}
      tabs={eligible.map((id) => ({ id, label: title(id), icon: icon(id), closable: !required.has(id) }))}
      activeId={active} dropIndex={dropIndex}
      onActivate={(panelId) => { if (panelId !== active) { dispatch({ type: "activate", panelId }); } }}
      onClose={(panelId) => dispatch({ type: "hide", panelId })}
      onTabDragStart={onDragStart}
      onTabContextMenu={(panelId, position) => setMenu({ panelId, position })}
      actions={<ToolbarIconButton icon={<MoreVertIcon fontSize="small" />} tooltip={t("batch2_2.dock.panelOptions", { panel: title(active) })}
        ariaLabel={t("batch2_2.dock.panelOptions", { panel: title(active) })} aria-haspopup="menu"
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ panelId: active, position: { x: rect.left, y: rect.bottom } });
        }} />} />
    <Box data-dock-body sx={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}>
      <Box ref={slotRef} data-dock-slot={group.id} role="tabpanel" id={`${idPrefix}-panel`}
        aria-labelledby={dockTabElementId(idPrefix, active)}
        sx={{ position: "absolute", inset: 0, overflow: "hidden" }} />
      <DockDropOverlay zone={target?.kind === "zone" ? target.zone : null} />
    </Box>
    <ContextMenu open={menu !== null} position={menu?.position ?? null} onClose={closeMenu}>
      <MenuItemPrimitive label={t("batch2_2.dock.closePanel", { panel: title(menuPanel) })} icon={<CloseIcon />} disabled={required.has(menuPanel)}
        tooltip={required.has(menuPanel) ? t("batch2_2.dock.requiredPanel") : undefined}
        onClick={() => run(() => dispatch({ type: "hide", panelId: menuPanel }))} />
      <MenuItemPrimitive label={maximized ? t("batch2_2.dock.restoreLayout") : t("batch2_2.dock.maximizeGroup")} shortcut="Shift+Space"
        icon={maximized ? <CloseFullscreenIcon /> : <OpenInFullIcon />} onClick={() => run(() => onToggleMaximize?.())} />
      {eligible.length > 1 && <MenuItemPrimitive label={axis === "row" ? t("batch2_2.dock.splitRight") : t("batch2_2.dock.splitBelow")} icon={<VerticalSplitOutlinedIcon />}
        onClick={() => run(() => {
          const action = dockDropAction(store.getState().layout, menuPanel,
            { kind: "zone", region, groupId: group.id, zone: axis === "row" ? "right" : "bottom" }, visible);
          if (action) { dispatch(action); }
        })} />}
      {menuIndex > 0 && <MenuItemPrimitive label={t("batch2_2.dock.moveTabLeft")} icon={<ChevronLeftIcon />} onClick={() => run(() => reorder(-1))} />}
      {menuIndex >= 0 && menuIndex < eligible.length - 1 && <MenuItemPrimitive label={t("batch2_2.dock.moveTabRight")} icon={<ChevronRightIcon />}
        onClick={() => run(() => reorder(1))} />}
      {DOCK_REGIONS.filter((entry) => entry !== region).map((entry, index) => <MenuItemPrimitive key={entry} dividerBefore={index === 0}
        label={t("batch2_2.dock.moveToRegion", { region: t(`batch2_2.dock.regions.${entry}`) })} icon={<LoginOutlinedIcon />}
        onClick={() => run(() => dispatch(dockMoveToRegion(store.getState().layout, menuPanel, entry)))} />)}
      {hiddenPanels.map((entry, index) => <MenuItemPrimitive key={entry.id} dividerBefore={index === 0} label={t("batch2_2.dock.addPanelTab", { panel: entry.title })} icon={<AddIcon />}
        onClick={() => run(() => {
          dispatch(dockDropAction(store.getState().layout, entry.id, { kind: "tab", region, groupId: group.id, index: eligible.length }, visible)
            ?? { type: "reveal", panelId: entry.id });
          dispatch({ type: "reveal", panelId: entry.id });
        })} />)}
    </ContextMenu>
  </FlexColumn>;
}
