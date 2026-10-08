import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { StoreApi } from "zustand";

import { useGlobalCombo } from "../../../stores/KeyPressedStore";
import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import { GAME_PANEL_REGIONS, type GamePanelGroup } from "../../../stores/game/GamePanelLayout";
import { Box, EditorButton, FlexColumn, FlexRow, SelectField, SPACING, TabGroup } from "../../ui_primitives";
import type { GamePanelRegion } from "./panelRegistry";
import type { GameDockPresentation } from "./useGameDockPresentation";

interface GameDockGroupProps {
  readonly group: GamePanelGroup;
  readonly region: GamePanelRegion;
  readonly presentation: GameDockPresentation;
  readonly store: StoreApi<GamePanelLayoutState>;
  readonly setSlot: (id: string, slot: HTMLElement | null) => void;
}

export function GameDockGroup({ group, region, presentation, store, setSlot }: GameDockGroupProps): ReactNode {
  const { metadata } = presentation;
  const eligible = group.panels.filter((id) => metadata.availableIds.includes(id) && !metadata.layout.hidden.includes(id));
  const active = eligible.includes(group.activePanelId) ? group.activePanelId : eligible[0];
  const drag = useRef<{ panelId: string; pointerId: number } | null>(null);
  const dragButton = useRef<HTMLButtonElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [movePosition, setMovePosition] = useState("end");
  const slotRef = useCallback((slot: HTMLElement | null) => setSlot(group.id, slot), [group.id, setSlot]);
  const cancel = useCallback((): void => { drag.current = null; setDragging(false); }, []);
  const shortcutTarget = useCallback(() => dragButton.current, []);
  useGlobalCombo("escape", cancel, { active: dragging, allowInInputs: true, scope: "global", target: shortcutTarget });
  useEffect(() => { cancel(); return cancel; }, [cancel, store]);
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [cancel]);
  if (!active) { return null; }
  const targets = GAME_PANEL_REGIONS.flatMap((targetRegion) => [
    { value: JSON.stringify([targetRegion, null]), region: targetRegion, groupId: null, label: `New ${targetRegion} group` },
    ...metadata.layout.regions[targetRegion].map((entry) => ({ value: JSON.stringify([targetRegion, entry.id]), region: targetRegion, groupId: entry.id, label: `${targetRegion}: ${entry.panels.join(", ")}` }))
  ]);
  const uniqueGroupId = (targetRegion: GamePanelRegion): string => {
    const ids = new Set(GAME_PANEL_REGIONS.flatMap((entry) => store.getState().layout.regions[entry].map((item) => item.id)));
    let index = 0;
    while (ids.has(`${targetRegion}-dock-${index}`)) { index += 1; }
    return `${targetRegion}-dock-${index}`;
  };
  const selectedTarget = targets.find((entry) => entry.value === moveTarget);
  const targetPanels = selectedTarget?.groupId
    ? metadata.layout.regions[selectedTarget.region].find((entry) => entry.id === selectedTarget.groupId)?.panels.filter((id) => id !== active) ?? [] : [];
  const move = (panelId: string, targetRegion: GamePanelRegion, groupId: string, beforeId?: string): void => {
    const target = store.getState().layout.regions[targetRegion].find((entry) => entry.id === groupId);
    const panels = target?.panels.filter((id) => id !== panelId) ?? [];
    const position = beforeId ? panels.indexOf(beforeId) : -1;
    const index = position < 0 ? panels.length : position;
    store.getState().dispatch({ type: "move", panelId, region: targetRegion, groupId, index });
  };
  return <FlexColumn data-game-dock-region={region} data-game-dock-group={group.id}
    sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
    <TabGroup size="small" value={active} aria-label={`${region} game panel tabs`}
      tabs={eligible.map((id) => ({ value: id, label: metadata.registry.find((entry) => entry.id === id)?.title ?? id }))}
      onChange={(panelId) => store.getState().dispatch({ type: "activate", panelId })} />
    <FlexRow gap={SPACING.xs}>
      <EditorButton ref={dragButton} aria-label={`Drag ${active} panel`} size="small"
        onPointerDown={(event) => {
          if (event.button !== 0) { return; }
          event.preventDefault();
          drag.current = { panelId: active, pointerId: event.pointerId };
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          cancel();
          if (!current || current.pointerId !== event.pointerId) { return; }
          const target = window.document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-game-dock-region]");
          const targetRegion = GAME_PANEL_REGIONS.find((entry) => entry === target?.dataset.gameDockRegion);
          if (targetRegion) { move(current.panelId, targetRegion, target?.dataset.gameDockGroup ?? uniqueGroupId(targetRegion)); }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId); }
        }}
        onPointerCancel={cancel} onLostPointerCapture={cancel} onBlur={cancel}
        onKeyDown={(event) => { if (event.key === "Escape") { cancel(); event.preventDefault(); } }}
        sx={{ touchAction: "none" }}>Drag</EditorButton>
      <SelectField label={`Move ${active} panel`} value={moveTarget} options={targets} onChange={(value) => { setMoveTarget(value); setMovePosition("end"); }} />
      <SelectField label={`Position ${active} panel`} value={movePosition}
        options={[{ value: "end", label: "At end" }, ...targetPanels.map((id) => ({ value: JSON.stringify(id), label: `Before ${id}` }))]}
        onChange={setMovePosition} />
      <EditorButton size="small" disabled={!moveTarget} onClick={() => {
        const selected = targets.find((entry) => entry.value === moveTarget);
        if (!selected) { return; }
        move(active, selected.region, selected.groupId ?? uniqueGroupId(selected.region), targetPanels.find((id) => JSON.stringify(id) === movePosition));
      }}>Move</EditorButton>
      {active !== "viewport" && <EditorButton size="small" onClick={() => store.getState().dispatch({ type: "hide", panelId: active })}>Hide</EditorButton>}
    </FlexRow>
    <Box ref={slotRef} data-game-dock-slot={group.id} role="tabpanel" aria-label={`${active} panel`}
      sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }} />
  </FlexColumn>;
}
