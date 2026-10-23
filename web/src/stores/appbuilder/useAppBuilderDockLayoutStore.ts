import { useMemo } from "react";
import type { StoreApi } from "zustand";

import useAuth from "../useAuth";
import { createDockLayoutStoreCache } from "../dock/browserDockLayoutStores";
import type { DockLayoutState } from "../dock/DockLayoutStore";
import { appBuilderDockLayoutModel } from "./AppBuilderDockLayout";

export const getAppBuilderDockLayoutStore = createDockLayoutStoreCache(appBuilderDockLayoutModel);

export function useAppBuilderDockLayoutStore(): StoreApi<DockLayoutState> {
  const userId = useAuth((state) => state.user?.id ?? null);
  return useMemo(() => getAppBuilderDockLayoutStore(userId), [userId]);
}
