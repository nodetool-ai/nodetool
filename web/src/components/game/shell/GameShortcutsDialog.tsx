import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    <Label>{t(`screen_game.commandCategories.${category}`)}</Label>
    {commands.filter((entry) => entry.category === category).map((entry) => {
      const current = bindings.get(entry.id) ?? [];
      const isRecording = recording === entry.id;
      return <FlexColumn key={entry.id} gap={SPACING.micro}>
        <FlexRow gap={SPACING.sm} align="center">
          <Text sx={{ flex: 1, minWidth: 0 }}>{t(`screen_game.commandTitles.${entry.id}`)}</Text>
          {isRecording ? <Caption role="status">{t("screen_game.shortcuts.pressKeyCombo")}</Caption>
            : current.length ? current.map((binding) => <ShortcutHint key={formatGameBinding(binding, mac).join("+")} shortcut={formatGameBinding(binding, mac)} />)
              : <Caption>{t("screen_game.shortcuts.noShortcut")}</Caption>}
          <EditorButton aria-label={t("screen_game.shortcuts.changeAria", { command: t(`screen_game.commandTitles.${entry.id}`) })} aria-pressed={isRecording}
            onClick={() => { setMessage(null); setRecording(isRecording ? null : entry.id); }}
            onKeyDown={isRecording ? (event: KeyboardEvent<HTMLElement>) => record(entry.id, event) : undefined}>
            {isRecording ? t("screen_game.common.cancel") : t("screen_game.shortcuts.change")}</EditorButton>
          <EditorButton aria-label={t("screen_game.shortcuts.removeAria", { command: t(`screen_game.commandTitles.${entry.id}`) })} disabled={current.length === 0}
            onClick={() => attempt(entry.id, () => store.getState().setBindings(entry.id, []))}>{t("screen_game.common.remove")}</EditorButton>
          <EditorButton aria-label={t("screen_game.shortcuts.resetAria", { command: t(`screen_game.commandTitles.${entry.id}`) })} disabled={!(entry.id in overrides)}
            onClick={() => attempt(entry.id, () => store.getState().resetBindings(entry.id))}>{t("screen_game.common.reset")}</EditorButton>
        </FlexRow>
        {message?.commandId === entry.id && <Caption color="error" role="alert">{message.text}</Caption>}
      </FlexColumn>;
    })}
  </FlexColumn>;
  return <Dialog open={open} onClose={close} title={t("screen_game.shortcuts.title")} maxWidth="md" fullWidth
    actions={<EditorButton disabled={Object.keys(overrides).length === 0}
      onClick={() => { store.getState().resetAll(); setMessage(null); }}>{t("screen_game.shortcuts.resetAll")}</EditorButton>}>
    <FlexColumn gap={SPACING.lg}>
      <Caption>{t("screen_game.shortcuts.description")}</Caption>
      {categories.map(group)}
    </FlexColumn>
  </Dialog>;
}
