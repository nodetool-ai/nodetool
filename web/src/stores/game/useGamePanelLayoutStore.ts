import { useMemo } from "react";
import type { StoreApi } from "zustand";

import useAuth from "../useAuth";
import { createDockLayoutStoreCache } from "../dock/browserDockLayoutStores";
import { gameDockLayoutModel } from "./GamePanelLayout";
import type { GamePanelLayoutState } from "./GamePanelLayoutStore";

export const getGamePanelLayoutStore = createDockLayoutStoreCache(gameDockLayoutModel);

export function useGamePanelLayoutStore(): StoreApi<GamePanelLayoutState> {
  const userId = useAuth((state) => state.user?.id ?? null);
  return useMemo(() => getGamePanelLayoutStore(userId), [userId]);
}
