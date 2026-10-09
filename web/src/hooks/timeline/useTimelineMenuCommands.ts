import { useMemo } from "react";

import { useSettingsStore } from "../../stores/SettingsStore";
import { useTimelineIsActive } from "../../stores/timeline/TimelineInstance";
import type { ContextCommand } from "../../stores/CommandMenuStore";
import { useContextCommands } from "../useContextCommands";
import { TIMELINE_SHORTCUT_GROUPS } from "../../components/timeline/TimelineShortcutsDialog";
import {
  TIMELINE_KEYMAPS,
  formatBinding,
  type KeyBinding,
  type TimelineAction
} from "../../components/timeline/timelineKeymap";
import { isMac } from "../../utils/platform";

/**
 * Replays an action's key binding. The tracks region resolves keys to actions
 * through the keymap and owns every effect, so a command that presses the key
 * does exactly what the key does, under whichever preset is chosen.
 */
const pressBinding = (binding: KeyBinding): void => {
  const mod = Boolean(binding.ctrl);
  const init: KeyboardEventInit = {
    key: binding.key,
    code: /^[a-z]$/i.test(binding.key) ? `Key${binding.key.toUpperCase()}` : undefined,
    ctrlKey: mod && !isMac(),
    metaKey: mod && isMac(),
    shiftKey: Boolean(binding.shift),
    altKey: Boolean(binding.alt),
    bubbles: true
  };
  window.dispatchEvent(new KeyboardEvent("keydown", init));
  window.dispatchEvent(new KeyboardEvent("keyup", init));
};

/** Lists the timeline's keyboard actions in the command menu while it is active. */
export const useTimelineMenuCommands = (): void => {
  const active = useTimelineIsActive();
  const preset = useSettingsStore(
    (state) => state.settings.timelineKeyboardPreset
  );

  const commands = useMemo<ContextCommand[]>(() => {
    const keymap = TIMELINE_KEYMAPS[preset];
    const seen = new Set<TimelineAction>();
    const list: ContextCommand[] = [];
    for (const group of TIMELINE_SHORTCUT_GROUPS) {
      for (const row of group.rows) {
        const action = row.action;
        const binding = action ? keymap[action]?.[0] : undefined;
        if (!action || !binding || seen.has(action) || action === "toggleShortcuts") {
          continue;
        }
        seen.add(action);
        list.push({
          id: action,
          label: row.label,
          keywords: [group.title],
          shortcut: formatBinding(binding),
          run: () => pressBinding(binding)
        });
      }
    }
    return list;
  }, [preset]);

  useContextCommands("Timeline", commands, active);
};
