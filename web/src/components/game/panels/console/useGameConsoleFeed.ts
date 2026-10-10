import { useEffect, useRef } from "react";

import { getGameConsoleStore } from "../../../../stores/game/GameConsoleStore";
import type { ScriptFailure } from "../../useGamePlaySession";
import type { GameConsoleEntry, GameConsoleSource } from "./gameConsoleModel";

interface GameConsoleFeedSources {
  /** The play session's error text, which also carries script failures. */
  readonly runtimeError: string | null;
  /** The play session's script failure, when `runtimeError` came from a script. */
  readonly scriptError: ScriptFailure | null;
  /** The failure of the last ten-second script diagnostic run. */
  readonly diagnosticError: ScriptFailure | null;
  /** The play session's current tick. */
  readonly tick: number;
}

/** Writes a line once each time its content changes. The tick is read when the line appears, so a running session does not repeat it. */
function useConsoleLine(gameId: string, source: GameConsoleSource, message: string | null, tick: number | undefined,
  entityId: string | null | undefined): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!message) { return; }
    const entry: { -readonly [Key in keyof GameConsoleEntry]: GameConsoleEntry[Key] } = { level: "error", source, message };
    if (tickRef.current !== undefined) { entry.tick = tickRef.current; }
    if (entityId) { entry.entityId = entityId; }
    getGameConsoleStore(gameId).getState().append(entry);
  }, [gameId, source, message, entityId]);
}

/** Writes the editor's play-session and diagnostic errors to the game's console as they appear. */
export function useGameConsoleFeed(gameId: string, { runtimeError, scriptError, diagnosticError, tick }: GameConsoleFeedSources): void {
  const scriptMessage = scriptError?.message ?? null;
  useConsoleLine(gameId, "runtime", runtimeError && runtimeError !== scriptMessage ? runtimeError : null, tick, null);
  useConsoleLine(gameId, "script", scriptMessage, scriptError?.tick, scriptError?.entityId);
  useConsoleLine(gameId, "diagnostic", diagnosticError?.message ?? null, diagnosticError?.tick, diagnosticError?.entityId);
}
