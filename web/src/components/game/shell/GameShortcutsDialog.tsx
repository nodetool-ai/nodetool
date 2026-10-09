import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";

import type { GameShortcutState } from "../../../stores/game/GameShortcutStore";
import { Caption, Dialog, EditorButton, FlexColumn, FlexRow, Label, ShortcutHint, SPACING, Text } from "../../ui_primitives";
import { isMac } from "../../../utils/platform";
import { formatGameBinding, GAME_COMMANDS, gameBindingFromEvent, resolveGameBindings, type GameCommandCategory } from "./gameCommands";
import type { GameDimension } from "./panelRegistry";

interface GameShortcutsDialogProps {
  readonly open: boolean;
  readonly dimension: GameDimension;
  readonly store: StoreApi<GameShortcutState>;
  readonly onClose: () => void;
}

/** Lists the editor commands for one dimension and lets the user record, remove or reset their shortcuts. */
export default function GameShortcutsDialog({ open, dimension, store, onClose }: GameShortcutsDialogProps): ReactNode {
  const overrides = useStore(store, (state) => state.overrides);
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<{ readonly commandId: string; readonly text: string } | null>(null);
  const bindings = resolveGameBindings(overrides);
  const mac = isMac();
  const commands = GAME_COMMANDS.filter((entry) => entry.dimensions.includes(dimension));
  const categories = [...new Set(commands.map((entry) => entry.category))];
  const attempt = (commandId: string, change: () => void): void => {
    try { change(); setMessage(null); }
    catch (cause) { setMessage({ commandId, text: cause instanceof Error ? cause.message : String(cause) }); }
  };
  const record = (commandId: string, event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Tab") { setRecording(null); return; }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setRecording(null); return; }
    const binding = gameBindingFromEvent(event);
    if (!binding) { return; }
    setRecording(null);
    attempt(commandId, () => store.getState().setBindings(commandId, [binding]));
  };
  const close = (): void => { setRecording(null); setMessage(null); onClose(); };
  const group = (category: GameCommandCategory): ReactNode => <FlexColumn key={category} gap={SPACING.xs}>
    <Label>{category}</Label>
    {commands.filter((entry) => entry.category === category).map((entry) => {
      const current = bindings.get(entry.id) ?? [];
      const isRecording = recording === entry.id;
      return <FlexColumn key={entry.id} gap={SPACING.micro}>
        <FlexRow gap={SPACING.sm} align="center">
          <Text sx={{ flex: 1, minWidth: 0 }}>{entry.title}</Text>
          {isRecording ? <Caption role="status">Press a key combination. Escape cancels.</Caption>
            : current.length ? current.map((binding) => <ShortcutHint key={formatGameBinding(binding, mac).join("+")} shortcut={formatGameBinding(binding, mac)} />)
              : <Caption>No shortcut</Caption>}
          <EditorButton aria-label={`Change shortcut for ${entry.title}`} aria-pressed={isRecording}
            onClick={() => { setMessage(null); setRecording(isRecording ? null : entry.id); }}
            onKeyDown={isRecording ? (event: KeyboardEvent<HTMLElement>) => record(entry.id, event) : undefined}>
            {isRecording ? "Cancel" : "Change"}</EditorButton>
          <EditorButton aria-label={`Remove shortcut for ${entry.title}`} disabled={current.length === 0}
            onClick={() => attempt(entry.id, () => store.getState().setBindings(entry.id, []))}>Remove</EditorButton>
          <EditorButton aria-label={`Reset shortcut for ${entry.title}`} disabled={!(entry.id in overrides)}
            onClick={() => attempt(entry.id, () => store.getState().resetBindings(entry.id))}>Reset</EditorButton>
        </FlexRow>
        {message?.commandId === entry.id && <Caption color="error" role="alert">{message.text}</Caption>}
      </FlexColumn>;
    })}
  </FlexColumn>;
  return <Dialog open={open} onClose={close} title="Keyboard shortcuts" maxWidth="md" fullWidth
    actions={<EditorButton disabled={Object.keys(overrides).length === 0}
      onClick={() => { store.getState().resetAll(); setMessage(null); }}>Reset all shortcuts</EditorButton>}>
    <FlexColumn gap={SPACING.lg}>
      <Caption>Shortcuts apply to both game editors. Ctrl and Cmd are interchangeable.</Caption>
      {categories.map(group)}
    </FlexColumn>
  </Dialog>;
}
