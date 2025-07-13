import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SerializedDockview } from "dockview";

export interface UserLayout {
  id: string;
  name: string;
  layout: SerializedDockview;
}

export interface Settings {
  gridSnap: number;
  connectionSnap: number;
  panControls: string;
  selectionMode: string;
  workflowOrder: "name" | "date";
  assetsOrder: "name" | "date" | "size";
  assetItemSize: number;
  timeFormat: "12h" | "24h";
  alertBeforeTabClose: boolean;
  selectNodesOnDrag: boolean;
  showWelcomeOnStartup: boolean;
  layouts: UserLayout[];
  activeLayoutId: string | null;
}

interface SettingsStore {
  settings: Settings;
  isMenuOpen: boolean;
  settingsTab: number;
  setMenuOpen: (value: boolean, tab?: number) => void;
  setGridSnap: (value: number) => void;
  setConnectionSnap: (value: number) => void;
  setPanControls: (value: string) => void;
  updateSettings: (newSettings: Partial<Settings>) => void;
  resetSettings: () => void;
  setSelectionMode: (value: string) => void;
  setWorkflowOrder: (value: "name" | "date") => void;
  setAssetsOrder: (value: "name" | "date" | "size") => void;
  setAssetItemSize: (value: number) => void;
  setTimeFormat: (value: "12h" | "24h") => void;
  setAlertBeforeTabClose: (value: boolean) => void;
  setSelectNodesOnDrag: (value: boolean) => void;
  setShowWelcomeOnStartup: (value: boolean) => void;
  addLayout: (layout: UserLayout) => void;
  deleteLayout: (layoutId: string) => void;
  setActiveLayoutId: (layoutId: string | null) => void;
}

export const defaultSettings: Settings = {
  gridSnap: 1,
  connectionSnap: 20,
  panControls: "LMB",
  selectionMode: "partial",
  workflowOrder: "name",
  assetsOrder: "name",
  assetItemSize: 2,
  timeFormat: "12h",
  alertBeforeTabClose: true,
  selectNodesOnDrag: false,
  showWelcomeOnStartup: true,
  layouts: [],
  activeLayoutId: null
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: { ...defaultSettings },
      isMenuOpen: false,
      settingsTab: 0,
      setMenuOpen: (value: boolean, tab?: number) =>
        set({ isMenuOpen: value, settingsTab: tab ?? 0 }),
      setGridSnap: (value: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            gridSnap: value || defaultSettings.gridSnap
          }
        })),

      setConnectionSnap: (value: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            connectionSnap: value || defaultSettings.connectionSnap
          }
        })),

      setPanControls: (value: string) =>
        set((state) => ({
          settings: {
            ...state.settings,
            panControls: value || defaultSettings.panControls
          }
        })),

      setSelectionMode: (value: string) =>
        set((state) => ({
          settings: {
            ...state.settings,
            selectionMode: value || defaultSettings.selectionMode
          }
        })),

      setWorkflowOrder: (value: "name" | "date") =>
        set((state) => ({
          settings: {
            ...state.settings,
            workflowOrder: value || defaultSettings.workflowOrder
          }
        })),

      setAssetsOrder: (value: "name" | "date" | "size") =>
        set((state) => ({
          settings: {
            ...state.settings,
            assetsOrder: value || defaultSettings.assetsOrder
          }
        })),

      setTimeFormat: (value: "12h" | "24h") =>
        set((state) => ({
          settings: {
            ...state.settings,
            timeFormat: value || defaultSettings.timeFormat
          }
        })),

      setAssetItemSize: (value: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            assetItemSize: value || defaultSettings.assetItemSize
          }
        })),

      updateSettings: (newSettings: Partial<Settings>) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        })),

      resetSettings: () => set({ settings: { ...defaultSettings } }),

      setAlertBeforeTabClose: (value: boolean) =>
        set((state) => ({
          settings: {
            ...state.settings,
            alertBeforeTabClose: value
          }
        })),
      setSelectNodesOnDrag: (value: boolean) =>
        set((state) => ({
          settings: {
            ...state.settings,
            selectNodesOnDrag: value ?? defaultSettings.selectNodesOnDrag
          }
        })),
      setShowWelcomeOnStartup: (value: boolean) =>
        set((state) => ({
          settings: {
            ...state.settings,
            showWelcomeOnStartup: value
          }
        })),
      addLayout: (layout: UserLayout) =>
        set((state) => ({
          settings: {
            ...state.settings,
            layouts: [...(state.settings.layouts || []), layout]
          }
        })),
      deleteLayout: (layoutId: string) =>
        set((state) => ({
          settings: {
            ...state.settings,
            layouts: (state.settings.layouts || []).filter(
              (l) => l.id !== layoutId
            )
          }
        })),
      setActiveLayoutId: (layoutId: string | null) =>
        set((state) => ({
          settings: {
            ...state.settings,
            activeLayoutId: layoutId
          }
        }))
    }),
    {
      name: "settings-storage",
      partialize: (state) => ({
        settings: state.settings
        // Don't persist menuAnchorEl state
      })
    }
  )
);
