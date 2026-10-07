import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { StoreApi } from "zustand";

import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import { GAME_PANEL_REGIONS } from "../../../stores/game/GamePanelLayout";
import { FlexColumn, FlexRow, Label, ResizeHandle, SPACING } from "../../ui_primitives";
import type { GamePanelRegion } from "./panelRegistry";
import { StableGamePanelHost } from "./StableGamePanelHost";
import { GameDockGroup } from "./GameDockGroup";
import type { GameDockPresentation } from "./useGameDockPresentation";

interface GameDockCanvasProps {
  readonly presentation: GameDockPresentation;
  readonly store: StoreApi<GamePanelLayoutState>;
}

export function GameDockCanvas({ presentation, store }: GameDockCanvasProps): ReactNode {
  const root = useRef<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
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
  const regionShown = (region: GamePanelRegion): boolean => metadata.layout.regions[region].some((group) => group.panels.some((id) => metadata.availableIds.includes(id) && !metadata.layout.hidden.includes(id)));
  const renderRegion = (region: GamePanelRegion): ReactNode => <FlexColumn component="section" role="region" aria-label={`Game ${region} panels`}
    data-game-dock-region={region} sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
    {metadata.layout.regions[region].map((group) => <GameDockGroup key={group.id} group={group} region={region}
      presentation={presentation} store={store} setSlot={setSlot} />)}
  </FlexColumn>;
  const widthMaximum = Math.max(100, Math.min(1600, bounds.width / 3));
  const bottomMaximum = Math.max(80, Math.min(1000, bounds.height / 2));
  const left = Math.min(metadata.layout.sizes.left, widthMaximum);
  const right = Math.min(metadata.layout.sizes.right, widthMaximum);
  const bottom = Math.min(metadata.layout.sizes.bottom, bottomMaximum);
  const resize = (region: "left" | "right" | "bottom", value: number, delta: number): void => {
    store.getState().dispatch({ type: "resize", region, size: value + delta });
  };
  return <FlexColumn ref={root} tabIndex={-1} sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
    <FlexRow gap={SPACING.md} aria-label="New dock group targets">
      {GAME_PANEL_REGIONS.map((region) => <FlexColumn key={region} data-game-dock-region={region} sx={{ flex: 1 }}>
        <Label>Dock to {region}</Label>
      </FlexColumn>)}
    </FlexRow>
    <FlexRow sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      {regionShown("left") && <><FlexColumn sx={{ width: left, minWidth: 0 }}>{renderRegion("left")}</FlexColumn>
        <ResizeHandle orientation="vertical" ariaLabel="Resize game left panels" value={left} min={100} max={widthMaximum} onResize={(delta) => resize("left", left, delta)} /></>}
      <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {renderRegion("viewport")}
        {regionShown("bottom") && <><ResizeHandle orientation="horizontal" invert ariaLabel="Resize game bottom panels" value={bottom} min={80} max={bottomMaximum} onResize={(delta) => resize("bottom", bottom, delta)} />
          <FlexColumn sx={{ height: bottom, minHeight: 0 }}>{renderRegion("bottom")}</FlexColumn></>}
      </FlexColumn>
      {regionShown("right") && <><ResizeHandle orientation="vertical" invert ariaLabel="Resize game right panels" value={right} min={100} max={widthMaximum} onResize={(delta) => resize("right", right, delta)} />
        <FlexColumn sx={{ width: right, minWidth: 0 }}>{renderRegion("right")}</FlexColumn></>}
    </FlexRow>
    {presentation.views.map((view) => {
      const group = GAME_PANEL_REGIONS.flatMap((region) => metadata.layout.regions[region]).find((entry) => entry.panels.includes(view.id));
      const eligible = group?.panels.filter((id) => metadata.availableIds.includes(id) && !metadata.layout.hidden.includes(id)) ?? [];
      const selected = group && eligible.includes(group.activePanelId) ? group.activePanelId : eligible[0];
      return <StableGamePanelHost key={view.id} id={view.id} slot={group ? slots.get(group.id) ?? null : null}
        resolveSlot={() => group ? [...(root.current?.querySelectorAll<HTMLElement>("[data-game-dock-slot]") ?? [])].find((node) => node.dataset.gameDockSlot === group.id) ?? null : null}
        active={selected === view.id} keyboardScope={view.keyboardScope} focusSnapshot={presentation.focusSnapshot}
        fallbackFocus={fallbackFocus}>{view.node}</StableGamePanelHost>;
    })}
  </FlexColumn>;
}
