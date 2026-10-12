import { GamePlayerSaves } from "@nodetool-ai/game-runtime";
import { createLocalGameSaveStorage } from "@nodetool-ai/game-renderer";

/**
 * Script saves for an editor play session. Projects have no key-value storage API for play sessions, so saves
 * live in localStorage, scoped by game id, with progress and settings saves kept apart.
 */
export function createEditorGameSaves(gameId: string, onError: (message: string) => void): GamePlayerSaves {
  return new GamePlayerSaves(createLocalGameSaveStorage(gameId, window.localStorage), {
    onError: (error) => onError(`Game save failed: ${error.message}`)
  });
}
