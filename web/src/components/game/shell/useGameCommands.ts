import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "zustand";

import { useGameShortcutStore } from "../../../stores/game/GameShortcutStore";
import { isMac } from "../../../utils/platform";
import { formatGameBinding, GAME_COMMANDS_BY_ID, type GameCommandHandler, type GameCommandHandlers } from "./gameCommands";

/** Handler sources for one editor. Components inside the shell register theirs, and the newest registration wins. */
export interface GameCommandRegistry {
  readonly register: (source: () => GameCommandHandlers) => () => void;
  readonly handler: (commandId: string) => GameCommandHandler | undefined;
}

export function createGameCommandRegistry(fallback: () => GameCommandHandlers): GameCommandRegistry {
  const sources: Array<() => GameCommandHandlers> = [];
  return {
    register(source) {
      sources.push(source);
      return () => {
        const index = sources.indexOf(source);
        if (index >= 0) { sources.splice(index, 1); }
      };
    },
    handler(commandId) {
      for (let index = sources.length - 1; index >= 0; index -= 1) {
        const handler = sources[index]()[commandId];
        if (handler) { return handler; }
      }
      return fallback()[commandId];
    }
  };
}

export const GameCommandContext = createContext<GameCommandRegistry | null>(null);

/** Supplies command handlers from a component rendered inside `GameEditorShell`, such as a viewport. */
export function useGameCommandHandlers(handlers: GameCommandHandlers): void {
  const registry = useContext(GameCommandContext);
  const latest = useRef(handlers);
  useLayoutEffect(() => { latest.current = handlers; });
  useEffect(() => registry?.register(() => latest.current), [registry]);
}

/** The first shortcut of a command, formatted for `ShortcutHint` and tooltips, or undefined when it has none. */
export function useGameCommandShortcut(commandId: string): string[] | undefined {
  const store = useGameShortcutStore();
  const override = useStore(store, (state) => state.overrides[commandId]);
  const binding = (override ?? GAME_COMMANDS_BY_ID.get(commandId)?.defaultBindings)?.[0];
  return binding ? formatGameBinding(binding, isMac()) : undefined;
}
