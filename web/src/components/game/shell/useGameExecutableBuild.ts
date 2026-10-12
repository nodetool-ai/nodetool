import { useCallback, useEffect, useRef, useState } from "react";

import { getGameConsoleStore } from "../../../stores/game/GameConsoleStore";
import { promptForMissingRuntimePackage } from "../../../stores/RuntimePackagePromptStore";
import { buildGameExecutable, GameExecutableBuildError } from "../../../utils/gameExecutableBuild";
import type { GameConsoleLevel } from "../panels/console/gameConsoleModel";

export interface GameExecutableBuildState {
  readonly building: boolean;
  /** The executable the last build wrote. */
  readonly binaryPath: string | null;
  readonly error: string | null;
  readonly run: () => void;
  readonly cancel: () => void;
  readonly dismiss: () => void;
}

/** Cargo prefixes its diagnostics with `error` or `warning`; everything else is progress. */
export function cargoLineLevel(line: string): GameConsoleLevel {
  const trimmed = line.trimStart();
  if (/^error\b/.test(trimmed)) { return "error"; }
  if (/^warning\b/.test(trimmed)) { return "warning"; }
  return "log";
}

/**
 * Compiles the game's published revision into a desktop executable and writes cargo's output to the game's
 * console as it arrives. `onStart` runs first, so the editor can show the console.
 */
export function useGameExecutableBuild(game: { readonly id: string; readonly name: string } | undefined,
  onStart: () => void): GameExecutableBuildState {
  const [building, setBuilding] = useState(false);
  const [binaryPath, setBinaryPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const gameId = game?.id;
  const gameName = game?.name ?? "";
  useEffect(() => () => controller.current?.abort(), []);
  const run = useCallback((): void => {
    if (!gameId || controller.current) { return; }
    const current = new AbortController();
    controller.current = current;
    const output = getGameConsoleStore(gameId).getState();
    setBuilding(true);
    setBinaryPath(null);
    setError(null);
    onStartRef.current();
    output.append({ level: "log", source: "build", message: `Building a desktop executable of ${gameName || "the game"} from the published revision` });
    buildGameExecutable(gameId, (event) => {
      if (event.type === "log") { output.append({ level: cargoLineLevel(event.line), source: "build", message: event.line }); }
      if (event.type === "status") { output.append({ level: "log", source: "build", message: event.message }); }
    }, current.signal)
      .then((done) => {
        output.append({ level: "log", source: "build", message: `Built ${done.binary_path}` });
        setBinaryPath(done.binary_path);
      })
      .catch((cause: unknown) => {
        if (current.signal.aborted) { return; }
        const message = cause instanceof Error ? cause.message : String(cause);
        output.append({ level: "error", source: "build", message });
        setError(message);
        if (cause instanceof GameExecutableBuildError && cause.runtimePackage) { promptForMissingRuntimePackage(cause.runtimePackage); }
      })
      .finally(() => {
        if (controller.current === current) { controller.current = null; }
        setBuilding(false);
      });
  }, [gameId, gameName]);
  const cancel = useCallback((): void => {
    if (!controller.current || !gameId) { return; }
    controller.current.abort();
    getGameConsoleStore(gameId).getState().append({ level: "warning", source: "build", message: "Build cancelled" });
  }, [gameId]);
  const dismiss = useCallback((): void => { setError(null); setBinaryPath(null); }, []);
  return { building, binaryPath, error, run, cancel, dismiss };
}
