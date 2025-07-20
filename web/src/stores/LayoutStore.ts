import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SerializedDockview } from "dockview";

export interface UserLayout {
  id: string;
  name: string;
  layout: SerializedDockview;
}

interface LayoutStore {
  layouts: UserLayout[];
  activeLayoutId: string | null;
  addLayout: (layout: UserLayout) => void;
  deleteLayout: (layoutId: string) => void;
  setActiveLayoutId: (layoutId: string | null) => void;
  updateActiveLayout: (layout: SerializedDockview) => void;
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      layouts: [],
      activeLayoutId: null,
      addLayout: (layout: UserLayout) =>
        set((state) => ({
          layouts: [...(state.layouts || []), layout]
        })),
      deleteLayout: (layoutId: string) =>
        set((state) => ({
          layouts: (state.layouts || []).filter((l) => l.id !== layoutId)
        })),
      setActiveLayoutId: (layoutId: string | null) =>
        set({ activeLayoutId: layoutId }),
      updateActiveLayout: (layout: SerializedDockview) =>
        set((state) => ({
          layouts: (state.layouts || []).map((l) =>
            l.id === state.activeLayoutId ? { ...l, layout } : l
          )
        }))
    }),
    {
      name: "layout-storage"
    }
  )
);
