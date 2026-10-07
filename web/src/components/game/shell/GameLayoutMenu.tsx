import { useEffect, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

import { GAME_LAYOUT_PRESETS } from "../../../stores/game/GamePanelLayout";
import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import { Caption, EditorButton, FlexRow, SelectField, SPACING, TextInput } from "../../ui_primitives";
import ReportBugButton from "../../support/ReportBugButton";

interface GameLayoutMenuProps {
  readonly store: StoreApi<GamePanelLayoutState>;
}

export function GameLayoutMenu({ store }: GameLayoutMenuProps): ReactNode {
  const customLayouts = useStore(store, (state) => state.customLayouts);
  const [selected, setSelected] = useState("Default");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setSelected("Default"); setName(""); setError(null); }, [store]);
  const custom = customLayouts.some((entry) => entry.name === selected);
  const act = (action: () => void): void => {
    try { action(); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change saved layout"); }
  };
  return <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.xs }}>
    <SelectField label="Game layout" value={selected}
      options={[...GAME_LAYOUT_PRESETS.map((value) => ({ value, label: value })), ...customLayouts.map((entry) => ({ value: entry.name, label: entry.name }))]}
      onChange={setSelected} />
    <EditorButton onClick={() => act(() => store.getState().selectLayout(selected))}>Apply layout</EditorButton>
    <TextInput label="Layout name" compact value={name} onChange={(event) => setName(event.target.value)} />
    <EditorButton disabled={!name.trim()} onClick={() => act(() => { store.getState().saveLayout(name); setSelected(name.trim()); })}>Save layout</EditorButton>
    <EditorButton disabled={!custom || !name.trim()} onClick={() => act(() => { store.getState().renameLayout(selected, name); setSelected(name.trim()); })}>Rename layout</EditorButton>
    <EditorButton disabled={!custom} onClick={() => act(() => { store.getState().deleteLayout(selected); setSelected("Default"); })}>Delete layout</EditorButton>
    {error && <FlexRow gap={SPACING.xs} align="center"><Caption role="alert" color="error">{error}</Caption>
      <ReportBugButton context={{ source: "panel-crash", summary: "Game layout could not be changed", errorText: error }} />
    </FlexRow>}
  </FlexRow>;
}
