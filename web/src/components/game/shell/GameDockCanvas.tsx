import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { StoreApi } from "zustand";

import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import { GAME_PANEL_REGIONS, type GamePanelGroup } from "../../../stores/game/GamePanelLayout";
import { Box, dockZoneAt, FlexColumn, FlexRow, ResizeHandle, SPACING, TYPOGRAPHY, Z_INDEX, BORDER_RADIUS, SHADOW } from "../../ui_primitives";
import type { GamePanelRegion } from "./panelRegistry";
import { StableGamePanelHost } from "./StableGamePanelHost";
import { GameDockGroup } from "./GameDockGroup";
import type { GameDockPresentation } from "./useGameDockPresentation";
import { GAME_REGION_AXIS, GAME_REGION_LABELS, GAME_REGION_ZONES, gameDockDropAction, type GameDockDropTarget } from "./gameDockTargets";

interface GameDockCanvasProps {
  readonly presentation: GameDockPresentation;
  readonly store: StoreApi<GamePanelLayoutState>;
}

/** The panel being dragged and where it would land if released now. */
export interface GameDockDrag {
  readonly panelId: string;
  readonly x: number;
  readonly y: number;
  readonly target: GameDockDropTarget | null;
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

export function GameDockCanvas({ presentation, store }: GameDockCanvasProps): ReactNode {
  const root = useRef<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<GameDockDrag | null>(null);
  const [maximized, setMaximized] = useState<string | null>(null);
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
  const groupShown = (group: GamePanelGroup): boolean => group.panels.some(visible);
  const regionShown = (region: GamePanelRegion): boolean => metadata.layout.regions[region].some(groupShown);
  const maximizedGroup = maximized ? GAME_PANEL_REGIONS.flatMap((region) => metadata.layout.regions[region]).find((group) => group.id === maximized && groupShown(group)) : undefined;
  useEffect(() => { if (maximized && !maximizedGroup) { setMaximized(null); } }, [maximized, maximizedGroup]);

  // Docking drag: hit-test the element under the pointer each move, commit on release.
  const dragRef = useRef<GameDockDrag | null>(null);
  const hitTest = useCallback((panelId: string, x: number, y: number): GameDockDropTarget | null => {
    const element = window.document.elementFromPoint(x, y);
    if (!element || !root.current?.contains(element)) { return null; }
    const edge = element.closest<HTMLElement>("[data-game-dock-edge]");
    const edgeRegion = GAME_PANEL_REGIONS.find((region) => region === edge?.dataset.gameDockEdge);
    if (edgeRegion) { return { kind: "region", region: edgeRegion }; }
    const groupElement = element.closest<HTMLElement>("[data-game-dock-group]");
    const region = GAME_PANEL_REGIONS.find((entry) => entry === groupElement?.dataset.gameDockRegion);
    const groupId = groupElement?.dataset.gameDockGroup;
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
    const body = groupElement.querySelector<HTMLElement>("[data-game-dock-body]") ?? groupElement;
    const zone = dockZoneAt(body.getBoundingClientRect(), x, y, GAME_REGION_ZONES[region]);
    return zone ? { kind: "zone", region, groupId, zone } : null;
  }, []);
  const endDrag = useCallback((commit: boolean): void => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!commit || !current?.target) { return; }
    const layout = store.getState().layout;
    const action = gameDockDropAction(layout, current.panelId, current.target, visible);
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

  const renderGroup = (group: GamePanelGroup, region: GamePanelRegion): ReactNode => <GameDockGroup key={group.id} group={group} region={region}
    presentation={presentation} store={store} setSlot={setSlot} drag={drag} onDragStart={startDrag}
    maximized={maximized === group.id} onToggleMaximize={() => setMaximized((current) => current === group.id ? null : group.id)} />;

  const widthMaximum = Math.max(100, Math.min(1600, bounds.width / 3));
  const bottomMaximum = Math.max(80, Math.min(1000, bounds.height / 2));
  const left = Math.min(metadata.layout.sizes.left, widthMaximum);
  const right = Math.min(metadata.layout.sizes.right, widthMaximum);
  const bottom = Math.min(metadata.layout.sizes.bottom, bottomMaximum);
  const resize = (region: "left" | "right" | "bottom", value: number, delta: number): void => {
    store.getState().dispatch({ type: "resize", region, size: value + delta });
  };
  const dragTitle = drag ? metadata.registry.find((entry) => entry.id === drag.panelId)?.title ?? drag.panelId : "";
  const edgeTarget = (region: GamePanelRegion): ReactNode => drag && !regionShown(region) && region !== "viewport"
    ? <Box data-game-dock-edge={region} aria-hidden sx={{
      flexShrink: 0, alignSelf: "stretch", bgcolor: drag.target?.kind === "region" && drag.target.region === region ? "action.selected" : "action.hover",
      border: 1, borderStyle: "dashed", borderColor: drag.target?.kind === "region" && drag.target.region === region ? "primary.main" : "divider",
      borderRadius: BORDER_RADIUS.sm, m: SPACING.micro,
      ...(region === "bottom" ? { height: SPACING.xxxl * 4 } : { width: SPACING.xxxl * 4 })
    }} /> : null;

  return <FlexColumn ref={root} tabIndex={-1} data-game-dock-canvas data-dragging={drag ? "true" : undefined}
    onKeyDown={(event) => {
      // Shift+Space on a focused tab maximizes its group, as in engine editors. Only on tabs, so typing and play input are untouched.
      if (event.key !== " " || !event.shiftKey || !(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "tab") { return; }
      const groupId = event.target.closest<HTMLElement>("[data-game-dock-group]")?.dataset.gameDockGroup;
      if (!groupId) { return; }
      event.preventDefault();
      setMaximized((current) => current === groupId ? null : groupId);
    }}
    sx={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", bgcolor: "background.default", cursor: drag ? "grabbing" : undefined,
      "&[data-dragging='true'] *": { cursor: "grabbing !important" } }}>
    {maximizedGroup
      ? <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {renderGroup(maximizedGroup, GAME_PANEL_REGIONS.find((region) => metadata.layout.regions[region].includes(maximizedGroup)) ?? "viewport")}
      </FlexColumn>
      : <FlexRow sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {edgeTarget("left")}
        {regionShown("left") && <><FlexColumn sx={{ width: left, minWidth: 0, flexShrink: 0 }}>
          <GameDockRegion region="left" groups={metadata.layout.regions.left.filter(groupShown)} store={store} renderGroup={renderGroup} />
        </FlexColumn>
        <ResizeHandle orientation="vertical" ariaLabel="Resize game left panels" value={left} min={100} max={widthMaximum} onResize={(delta) => resize("left", left, delta)} /></>}
        <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <GameDockRegion region="viewport" groups={metadata.layout.regions.viewport.filter(groupShown)} store={store} renderGroup={renderGroup} />
          {regionShown("bottom") && <><ResizeHandle orientation="horizontal" invert ariaLabel="Resize game bottom panels" value={bottom} min={80} max={bottomMaximum} onResize={(delta) => resize("bottom", bottom, delta)} />
            <FlexColumn sx={{ height: bottom, minHeight: 0, flexShrink: 0 }}>
              <GameDockRegion region="bottom" groups={metadata.layout.regions.bottom.filter(groupShown)} store={store} renderGroup={renderGroup} />
            </FlexColumn></>}
          {edgeTarget("bottom")}
        </FlexColumn>
        {regionShown("right") && <><ResizeHandle orientation="vertical" invert ariaLabel="Resize game right panels" value={right} min={100} max={widthMaximum} onResize={(delta) => resize("right", right, delta)} />
          <FlexColumn sx={{ width: right, minWidth: 0, flexShrink: 0 }}>
            <GameDockRegion region="right" groups={metadata.layout.regions.right.filter(groupShown)} store={store} renderGroup={renderGroup} />
          </FlexColumn></>}
        {edgeTarget("right")}
      </FlexRow>}
    {drag && <Box aria-hidden data-game-dock-ghost sx={(theme) => ({
      position: "fixed", left: drag.x + SPACING.xl * 4, top: drag.y + SPACING.xl * 4, pointerEvents: "none", zIndex: Z_INDEX.tooltip,
      px: SPACING.md, py: SPACING.xs, borderRadius: BORDER_RADIUS.sm, bgcolor: "background.paper", border: 1, borderColor: "primary.main",
      boxShadow: SHADOW(theme).md, ...TYPOGRAPHY.sans.label, color: "text.primary", whiteSpace: "nowrap"
    })}>{dragTitle}{drag.target ? ` to ${describeTarget(drag.target)}` : ""}</Box>}
    {presentation.views.map((view) => {
      const group = GAME_PANEL_REGIONS.flatMap((region) => metadata.layout.regions[region]).find((entry) => entry.panels.includes(view.id));
      const eligible = group?.panels.filter(visible) ?? [];
      const selected = group && eligible.includes(group.activePanelId) ? group.activePanelId : eligible[0];
      return <StableGamePanelHost key={view.id} id={view.id} slot={group ? slots.get(group.id) ?? null : null}
        resolveSlot={() => group ? [...(root.current?.querySelectorAll<HTMLElement>("[data-game-dock-slot]") ?? [])].find((node) => node.dataset.gameDockSlot === group.id) ?? null : null}
        active={selected === view.id} keyboardScope={view.keyboardScope} focusSnapshot={presentation.focusSnapshot}
        fallbackFocus={fallbackFocus}>{view.node}</StableGamePanelHost>;
    })}
  </FlexColumn>;
}

function describeTarget(target: GameDockDropTarget): string {
  if (target.kind === "region") { return `the ${GAME_REGION_LABELS[target.region]}`; }
  if (target.kind === "tab" || target.zone === "center") { return "this group"; }
  return `a new group ${target.zone === "top" ? "above" : target.zone === "bottom" ? "below" : `on the ${target.zone}`}`;
}

interface GameDockRegionProps {
  readonly region: GamePanelRegion;
  readonly groups: readonly GamePanelGroup[];
  readonly store: StoreApi<GamePanelLayoutState>;
  readonly renderGroup: (group: GamePanelGroup, region: GamePanelRegion) => ReactNode;
}

/** One dock region: its groups side by side or stacked, with a separator between each pair. */
function GameDockRegion({ region, groups, store, renderGroup }: GameDockRegionProps): ReactNode {
  const [measure, size] = useElementSize();
  const axis = GAME_REGION_AXIS[region];
  const Layout = axis === "row" ? FlexRow : FlexColumn;
  const handleLength = 6;
  const length = Math.max(0, (axis === "row" ? size.width : size.height) - handleLength * Math.max(0, groups.length - 1));
  const weights = groups.map((group) => group.weight ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return <Layout ref={measure} component="section" role="region" aria-label={`Game ${region} panels`} data-game-dock-region={region}
    sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
    {groups.map((group, index) => {
      const next = groups[index + 1];
      const weight = weights[index] ?? 1;
      const pairWeight = weight + (weights[index + 1] ?? 1);
      const pairLength = length * pairWeight / total;
      const value = length * weight / total;
      return <Fragment key={group.id}>
        <FlexColumn sx={{ flex: `${weight} 1 0`, minHeight: 0, minWidth: 0 }}>{renderGroup(group, region)}</FlexColumn>
        {next && <ResizeHandle orientation={axis === "row" ? "vertical" : "horizontal"} ariaLabel={`Resize ${group.activePanelId} group`}
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
