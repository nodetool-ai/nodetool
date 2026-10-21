import { useCallback, useRef, useState } from "react";

import { exportGameZip, type GameExportTarget } from "../../../utils/gameExportZip";

export interface GameExportState {
  readonly exporting: GameExportTarget | null;
  readonly error: string | null;
  readonly run: (target: GameExportTarget) => void;
  readonly dismiss: () => void;
}

/** Downloads the game's published revision as a web player, a Tauri desktop project or an Expo mobile project, one export at a time. */
export function useGameExport(game: { readonly id: string; readonly name: string } | undefined): GameExportState {
  const [exporting, setExporting] = useState<GameExportTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const gameId = game?.id;
  const gameName = game?.name ?? "";
  const run = useCallback((target: GameExportTarget): void => {
    if (!gameId || busy.current) { return; }
    busy.current = true;
    setExporting(target);
    setError(null);
    exportGameZip(gameId, target, gameName)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => { busy.current = false; setExporting(null); });
  }, [gameId, gameName]);
  const dismiss = useCallback((): void => setError(null), []);
  return { exporting, error, run, dismiss };
}
