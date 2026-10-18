import { createDockLayoutStore, type DockLayoutScope, type DockLayoutState, type DockLayoutStorage } from "../dock/DockLayoutStore";
import { gameDockLayoutModel } from "./GamePanelLayout";

export type GameLayoutStorage = DockLayoutStorage;
export type GamePanelLayoutState = DockLayoutState;

export function createGamePanelLayoutStore(scope: DockLayoutScope, storage: GameLayoutStorage) {
  return createDockLayoutStore(gameDockLayoutModel, scope, storage);
}
