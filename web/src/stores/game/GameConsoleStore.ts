import { createStore, type StoreApi } from "zustand/vanilla";

import { appendGameConsoleEntry, type GameConsoleEntry, type GameConsoleGroup } from "../../components/game/panels/console/gameConsoleModel";

/**
 * The editor console for one game. It lives beside the draft store, not in it: console lines are presentation
 * data, so they never reach the document, the undo history or a play-session snapshot.
 */
export interface GameConsoleState {
  readonly groups: readonly GameConsoleGroup[];
  readonly nextId: number;
  readonly append: (entry: GameConsoleEntry) => void;
  readonly clear: () => void;
}

export type GameConsoleStore = StoreApi<GameConsoleState>;

export function createGameConsoleStore(): GameConsoleStore {
  return createStore<GameConsoleState>()((set) => ({
    groups: [],
    nextId: 1,
    append: (entry) => set((state) => ({ groups: appendGameConsoleEntry(state.groups, entry, state.nextId), nextId: state.nextId + 1 })),
    clear: () => set({ groups: [] })
  }));
}

const stores = new Map<string, GameConsoleStore>();

export function getGameConsoleStore(gameId: string): GameConsoleStore {
  const existing = stores.get(gameId);
  if (existing) { return existing; }
  const store = createGameConsoleStore();
  stores.set(gameId, store);
  return store;
}
