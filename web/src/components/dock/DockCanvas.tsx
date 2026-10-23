import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { DockLayoutState } from "../../stores/dock/DockLayoutStore";
import { DOCK_REGIONS, capitalizeLabel, type DockLayoutGroup, type DockRegion } from "../../stores/dock/DockLayout";
import { Box, dockZoneAt, FlexColumn, FlexRow, ResizeHandle, SPACING, TYPOGRAPHY, Z_INDEX, BORDER_RADIUS, SHADOW } from "../ui_primitives";
import { StablePanelHost } from "./StablePanelHost";
import { DockGroup } from "./DockGroup";
import type { DockPresentation } from "./useDockPresentation";
import { DOCK_REGION_AXIS, DOCK_REGION_ZONES, dockDropAction, type DockDropTarget } from "./dockTargets";

/** What a command outside the canvas can ask of the group filling this canvas. */
export interface DockMaximizeController {
  /** The group filling the canvas, or null. */
  readonly current: () => string | null;
  readonly set: (groupId: string | null) => void;
  /** Maximizes the group, or restores the layout when that group is already maximized. */
  readonly toggle: (groupId: string) => void;
}

interface DockCanvasProps {
  readonly presentation: DockPresentation;
  readonly store: StoreApi<DockLayoutState>;
  /** Receives this canvas's maximize controller while it is mounted. */
  readonly maximizeRef?: MutableRefObject<DockMaximizeController | null>;
  /** Panel ids that mount before their first activation, such as the viewport. Others mount when first shown. */
  readonly eagerPanels?: readonly string[];
  /** Height, in px, added to the bottom region for now. Not stored: the saved size is untouched. */
  readonly extraBottom?: number;
  /** Draws the groups without tab strips, for a canvas that shows one panel with no chrome, such as a phone layout. */
  readonly tabless?: boolean;
}

/** The panel being dragged and where it would land if released now. */
export interface DockDrag {
  readonly panelId: string;
  readonly x: number;
  readonly y: number;
  readonly target: DockDropTarget | null;
}

/** Smallest length, in px, a group keeps when its neighbour is resized. */
const MIN_GROUP_LENGTH = 64;
/** Mirrors the layout schema's lower bound on a group weight. */
const MIN_WEIGHT = 0.05;

function useElementSize(): [(node: HTMLElement | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) { return; }
    observer.current = new ResizeObserver(([entry]) => {
      if (entry) { setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); }
    });
    observer.current.observe(node);
  }, []);
  return [ref, size];
}

export function DockCanvas({ presentation, store, maximizeRef, eagerPanels, extraBottom = 0, tabless = false }: DockCanvasProps): ReactNode {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<DockDrag | null>(null);
  const [maximized, setMaximized] = useState<string | null>(null);
  const maximizedNow = useRef<string | null>(null);
  const maximize = useRef<DockMaximizeController | null>(null);
  if (!maximize.current) {
    const set = (groupId: string | null): void => { maximizedNow.current = groupId; setMaximized(groupId); };
    maximize.current = { current: () => maximizedNow.current, set, toggle: (groupId) => set(maximizedNow.current === groupId ? null : groupId) };
  }
  useLayoutEffect(() => {
    if (!maximizeRef) { return; }
    maximizeRef.current = maximize.current;
    return () => { if (maximizeRef.current === maximize.current) { maximizeRef.current = null; } };
  }, [maximizeRef]);
  // Choosing or resetting a layout restores the full dock.
  const layoutEpoch = useStore(store, (state) => state.layoutEpoch);
  useEffect(() => { maximize.current?.set(null); }, [layoutEpoch]);
  // A panel mounts when first shown and stays mounted, so its state survives being tabbed away.
  const everShown = useRef(new Set<string>());
  const label = store.getState().model.editorLabel;
  useEffect(() => {
    const node = root.current;
    if (!node) { return; }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) { setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }); }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const setSlot = useCallback((id: string, slot: HTMLElement | null): void => {
    setSlots((current) => {
      if (current.get(id) === slot || (!slot && !current.has(id))) { return current; }
      const next = new Map(current);
      if (slot) { next.set(id, slot); } else { next.delete(id); }
      return next;
    });
  }, []);
  const fallbackFocus = useCallback((): HTMLElement | null => root.current?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']") ?? root.current, []);
  const { metadata } = presentation;
  const visible = useCallback((id: string): boolean => metadata.availableIds.includes(id) && !metadata.layout.hidden.includes(id),
    [metadata.availableIds, metadata.layout.hidden]);
  const groupShown = (group: DockLayoutGroup): boolean => group.panels.some(visible);
  const regionShown = (region: DockRegion): boolean => metadata.layout.regions[region].some(groupShown);
  const maximizedGroup = maximized ? DOCK_REGIONS.flatMap((region) => metadata.layout.regions[region]).find((group) => group.id === maximized && groupShown(group)) : undefined;
  useEffect(() => { if (maximized && !maximizedGroup) { maximize.current?.set(null); } }, [maximized, maximizedGroup]);

  // Docking drag: hit-test the element under the pointer each move, commit on release.
  const dragRef = useRef<DockDrag | null>(null);
  const hitTest = useCallback((panelId: string, x: number, y: number): DockDropTarget | null => {
    const element = window.document.elementFromPoint(x, y);
    if (!element || !root.current?.contains(element)) { return null; }
    const edge = element.closest<HTMLElement>("[data-dock-edge]");
    const edgeRegion = DOCK_REGIONS.find((region) => region === edge?.dataset.dockEdge);
    if (edgeRegion) { return { kind: "region", region: edgeRegion }; }
    const groupElement = element.closest<HTMLElement>("[data-dock-group]");
    const region = DOCK_REGIONS.find((entry) => entry === groupElement?.dataset.dockRegion);
    const groupId = groupElement?.dataset.dockGroup;
    if (!groupElement || !region || !groupId) { return null; }
    const strip = element.closest<HTMLElement>("[data-dock-tabstrip]");
    if (strip && groupElement.contains(strip)) {
      const tabs = [...strip.querySelectorAll<HTMLElement>("[data-dock-tab]")].filter((tab) => tab.dataset.dockTab !== panelId);
      const index = tabs.findIndex((tab) => {
        const rect = tab.getBoundingClientRect();
        return x < rect.left + rect.width / 2;
      });
      return { kind: "tab", region, groupId, index: index < 0 ? tabs.length : index };
    }
    const body = groupElement.querySelector<HTMLElement>("[data-dock-body]") ?? groupElement;
    const zone = dockZoneAt(body.getBoundingClientRect(), x, y, DOCK_REGION_ZONES[region]);
    return zone ? { kind: "zone", region, groupId, zone } : null;
  }, []);
  const endDrag = useCallback((commit: boolean): void => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!commit || !current?.target) { return; }
    const layout = store.getState().layout;
    const action = dockDropAction(layout, current.panelId, current.target, visible);
    if (action) { store.getState().dispatch(action); }
  }, [store, visible]);
  const startDrag = useCallback((panelId: string, event: PointerEvent): void => {
    const next = { panelId, x: event.clientX, y: event.clientY, target: null };
    dragRef.current = next;
    setDrag(next);
  }, []);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) { return; }
    const move = (event: PointerEvent): void => {
      const current = dragRef.current;
      if (!current) { return; }
      const next = { ...current, x: event.clientX, y: event.clientY, target: hitTest(current.panelId, event.clientX, event.clientY) };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (event: PointerEvent): void => {
      const current = dragRef.current;
      if (current) { dragRef.current = { ...current, target: hitTest(current.panelId, event.clientX, event.clientY) }; }
      endDrag(true);
    };
    const cancel = (): void => endDrag(false);
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); endDrag(false); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
    };
  }, [dragging, endDrag, hitTest]);

  const renderGroup = (group: DockLayoutGroup, region: DockRegion): ReactNode => <DockGroup key={group.id} group={group} region={region}
    presentation={presentation} store={store} setSlot={setSlot} drag={drag} onDragStart={startDrag} tabless={tabless}
    maximized={maximized === group.id} onToggleMaximize={() => maximize.current?.toggle(group.id)} />;

  const widthMaximum = Math.max(100, Math.min(1600, bounds.width / 3));
  const bottomMaximum = Math.max(80, Math.min(1000, bounds.height * (store.getState().model.maxBottomFraction ?? 0.5)));
  const left = Math.min(metadata.layout.sizes.left, widthMaximum);
  const right = Math.min(metadata.layout.sizes.right, widthMaximum);
  const stored = Math.min(metadata.layout.sizes.bottom, bottomMaximum);
  const bottom = Math.min(stored + extraBottom, bottomMaximum);
  const resize = (region: "left" | "right" | "bottom", value: number, delta: number): void => {
    store.getState().dispatch({ type: "resize", region, size: value + delta });
  };
  for (const id of everShown.current) {
    if (!presentation.views.some((view) => view.id === id)) { everShown.current.delete(id); }
  }
  const dragTitle = drag ? metadata.registry.find((entry) => entry.id === drag.panelId)?.title ?? drag.panelId : "";
  const edgeTarget = (region: DockRegion): ReactNode => drag && !regionShown(region) && region !== "viewport"
    ? <Box data-dock-edge={region} aria-hidden sx={{
      flexShrink: 0, alignSelf: "stretch", bgcolor: drag.target?.kind === "region" && drag.target.region === region ? "action.selected" : "action.hover",
      border: 1, borderStyle: "dashed", borderColor: drag.target?.kind === "region" && drag.target.region === region ? "primary.main" : "divider",
      borderRadius: BORDER_RADIUS.sm, m: SPACING.micro,
      ...(region === "bottom" ? { height: SPACING.xxxl * 4 } : { width: SPACING.xxxl * 4 })
    }} /> : null;

  return <FlexColumn ref={root} tabIndex={-1} data-dock-canvas data-dragging={drag ? "true" : undefined}
    onKeyDown={(event) => {
      // Shift+Space on a focused tab maximizes its group. Only on tabs, so typing and play input are untouched.
      if (event.key !== " " || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "tab") { return; }
      const groupId = event.target.closest<HTMLElement>("[data-dock-group]")?.dataset.dockGroup;
      if (!groupId) { return; }
      event.preventDefault();
      maximize.current?.toggle(groupId);
    }}
    sx={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", bgcolor: "background.default", cursor: drag ? "grabbing" : undefined,
      "&[data-dragging='true'] *": { cursor: "grabbing !important" } }}>
    {maximizedGroup
      ? <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {renderGroup(maximizedGroup, DOCK_REGIONS.find((region) => metadata.layout.regions[region].includes(maximizedGroup)) ?? "viewport")}
      </FlexColumn>
      : <FlexRow sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {edgeTarget("left")}
        {regionShown("left") && <><FlexColumn sx={{ width: left, minWidth: 0, flexShrink: 0 }}>
          <DockRegionView region="left" label={label} groups={metadata.layout.regions.left.filter(groupShown)} store={store} renderGroup={renderGroup} />
        </FlexColumn>
        <ResizeHandle orientation="vertical" ariaLabel={t("batch2_2.dock.resizePanels", { editor: capitalizeLabel(label), region: t("batch2_2.dock.regions.left") })} value={left} min={100} max={widthMaximum} onResize={(delta) => resize("left", left, delta)} /></>}
        <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <DockRegionView region="viewport" label={label} groups={metadata.layout.regions.viewport.filter(groupShown)} store={store} renderGroup={renderGroup} />
          {regionShown("bottom") && <><ResizeHandle orientation="horizontal" invert ariaLabel={t("batch2_2.dock.resizePanels", { editor: capitalizeLabel(label), region: t("batch2_2.dock.regions.bottom") })} value={bottom} min={80} max={bottomMaximum} onResize={(delta) => resize("bottom", bottom - extraBottom, delta)} />
            <FlexColumn sx={{ height: bottom, minHeight: 0, flexShrink: 0 }}>
              <DockRegionView region="bottom" label={label} groups={metadata.layout.regions.bottom.filter(groupShown)} store={store} renderGroup={renderGroup} />
            </FlexColumn></>}
          {edgeTarget("bottom")}
        </FlexColumn>
        {regionShown("right") && <><ResizeHandle orientation="vertical" invert ariaLabel={t("batch2_2.dock.resizePanels", { editor: capitalizeLabel(label), region: t("batch2_2.dock.regions.right") })} value={right} min={100} max={widthMaximum} onResize={(delta) => resize("right", right, delta)} />
          <FlexColumn sx={{ width: right, minWidth: 0, flexShrink: 0 }}>
            <DockRegionView region="right" label={label} groups={metadata.layout.regions.right.filter(groupShown)} store={store} renderGroup={renderGroup} />
          </FlexColumn></>}
        {edgeTarget("right")}
      </FlexRow>}
    {drag && <Box aria-hidden data-dock-ghost sx={(theme) => ({
      position: "fixed", left: drag.x + SPACING.xl * 4, top: drag.y + SPACING.xl * 4, pointerEvents: "none", zIndex: Z_INDEX.tooltip,
      px: SPACING.md, py: SPACING.xs, borderRadius: BORDER_RADIUS.sm, bgcolor: "background.paper", border: 1, borderColor: "primary.main",
      boxShadow: SHADOW(theme).md, ...TYPOGRAPHY.sans.label, color: "text.primary", whiteSpace: "nowrap"
    })}>{dragTitle}{drag.target ? t("batch2_2.dock.dragDestination", { target: describeTarget(drag.target, t) }) : ""}</Box>}
    {presentation.views.map((view) => {
      const group = DOCK_REGIONS.flatMap((region) => metadata.layout.regions[region]).find((entry) => entry.panels.includes(view.id));
      const eligible = group?.panels.filter(visible) ?? [];
      const selected = group && eligible.includes(group.activePanelId) ? group.activePanelId : eligible[0];
      const active = selected === view.id;
      if (active || eagerPanels?.includes(view.id)) { everShown.current.add(view.id); }
      return <StablePanelHost key={view.id} id={view.id} slot={group ? slots.get(group.id) ?? null : null}
        resolveSlot={() => group ? [...(root.current?.querySelectorAll<HTMLElement>("[data-dock-slot]") ?? [])].find((node) => node.dataset.dockSlot === group.id) ?? null : null}
        active={active} keyboardScope={view.keyboardScope} focusSnapshot={presentation.focusSnapshot}
        fallbackFocus={fallbackFocus}>{everShown.current.has(view.id) ? view.node : null}</StablePanelHost>;
    })}
  </FlexColumn>;
}

function describeTarget(target: DockDropTarget, t: TFunction): string {
  if (target.kind === "region") { return t(`batch2_2.dock.regions.${target.region}`); }
  if (target.kind === "tab" || target.zone === "center") { return t("batch2_2.dock.thisGroup"); }
  return t("batch2_2.dock.newGroupPosition", { position: t(`batch2_2.dock.positions.${target.zone}`) });
}

interface DockRegionViewProps {
  readonly region: DockRegion;
  readonly label: string;
  readonly groups: readonly DockLayoutGroup[];
  readonly store: StoreApi<DockLayoutState>;
  readonly renderGroup: (group: DockLayoutGroup, region: DockRegion) => ReactNode;
}

/** One dock region: its groups side by side or stacked, with a separator between each pair. */
function DockRegionView({ region, label, groups, store, renderGroup }: DockRegionViewProps): ReactNode {
  const { t } = useTranslation();
  const [measure, size] = useElementSize();
  const axis = DOCK_REGION_AXIS[region];
  const Layout = axis === "row" ? FlexRow : FlexColumn;
  const handleLength = 6;
  const length = Math.max(0, (axis === "row" ? size.width : size.height) - handleLength * Math.max(0, groups.length - 1));
  const weights = groups.map((group) => group.weight ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return <Layout ref={measure} component="section" role="region" aria-label={t("batch2_2.dock.regionPanels", { editor: capitalizeLabel(label), region: t(`batch2_2.dock.regions.${region}`) })} data-dock-region={region}
    sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
    {groups.map((group, index) => {
      const next = groups[index + 1];
      const weight = weights[index] ?? 1;
      const pairWeight = weight + (weights[index + 1] ?? 1);
      const pairLength = length * pairWeight / total;
      const value = length * weight / total;
      return <Fragment key={group.id}>
        <FlexColumn sx={{ flex: `${weight} 1 0`, minHeight: 0, minWidth: 0 }}>{renderGroup(group, region)}</FlexColumn>
        {next && <ResizeHandle orientation={axis === "row" ? "vertical" : "horizontal"} ariaLabel={t("batch2_2.dock.resizeGroup", { group: group.activePanelId })}
          value={value} min={Math.min(MIN_GROUP_LENGTH, pairLength / 2)} max={Math.max(pairLength - MIN_GROUP_LENGTH, pairLength / 2)}
          onResize={(delta) => {
            if (pairLength <= 0) { return; }
            const first = Math.min(pairWeight - MIN_WEIGHT, Math.max(MIN_WEIGHT, pairWeight * (value + delta) / pairLength));
            store.getState().dispatch({ type: "resizeGroups", region, weights: { [group.id]: first, [next.id]: pairWeight - first } });
          }} />}
      </Fragment>;
    })}
  </Layout>;
}
