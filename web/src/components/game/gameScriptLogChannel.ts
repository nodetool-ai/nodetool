import type { GameScriptLogEntry } from "@nodetool-ai/game-runtime";

export type GameScriptLogListener = (logs: readonly GameScriptLogEntry[]) => void;

/**
 * Passes each step's script log lines from a play session to the console without React state, so a
 * running game does not re-render its editor once per tick.
 */
export interface GameScriptLogChannel {
  readonly publish: (logs: readonly GameScriptLogEntry[]) => void;
  readonly subscribe: (listener: GameScriptLogListener) => () => void;
}

export function createGameScriptLogChannel(): GameScriptLogChannel {
  const listeners = new Set<GameScriptLogListener>();
  return {
    publish: (logs) => {
      for (const listener of listeners) { listener(logs); }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}
