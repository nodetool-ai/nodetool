import { useMemo } from "react";
import type { StoreApi } from "zustand";

import useAuth from "../useAuth";
import { createDockLayoutStoreCache } from "../dock/browserDockLayoutStores";
import type { DockLayoutState } from "../dock/DockLayoutStore";
import { sketchDockLayoutModel } from "./SketchDockLayout";

export const getSketchDockLayoutStore = createDockLayoutStoreCache(sketchDockLayoutModel);

/** The signed-in user's sketch dock layout, shared by every open sketch editor. */
export function useSketchDockLayoutStore(): StoreApi<DockLayoutState> {
  const userId = useAuth((state) => state.user?.id ?? null);
  return useMemo(() => getSketchDockLayoutStore(userId), [userId]);
}
