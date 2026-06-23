import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isMac } from "../utils/platform";

interface AutosaveSettings {
  enabled: boolean;
  intervalMinutes: number; // 1-60, default 20
  saveBeforeRun: boolean;
  saveOnClose: boolean;
  maxVersionsPerWorkflow: number; // default 50
  keepManualVersionsDays: number; // default 90
  keepAutosaveVersionsDays: number; // default 7
}

export const defaultAutosaveSettings: AutosaveSettings = {
  enabled: true,
  intervalMinutes: 20,
  saveBeforeRun: true,
  saveOnClose: true,
  maxVersionsPerWorkflow: 50,
  keepManualVersionsDays: 90,
  keepAutosaveVersionsDays: 7
};

export interface Settings {
  gridSnap: number;
  connectionSnap: number;
  panControls: string;
  selectionMode: string;
  workflowOrder: "name" | "date";
  /** Layout used for the "Recent workflows" list on the dashboard portal. */
  dashboardWorkflowView: "grid" | "list";
  assetsOrder: "name" | "date" | "size";
  assetItemSize: number;
  timeFormat: "12h" | "24h";
  alertBeforeTabClose: boolean;
  selectNodesOnDrag: boolean;
  showWelcomeOnStartup: boolean;
  soundNotifications: boolean;
  /**
   * When enabled, changing any node property will trigger execution of
   * the downstream subgraph automatically (like "Run from here").
   */
  instantUpdate: boolean;
  editorViewMode: "graph" | "chain";
  /**
   * How the SketchNode opens the Image Editor when clicked:
   * - "modal":      fullscreen modal portal inside the workflow editor (default).
   * - "standalone": navigates to the standalone `/sketch/:documentId` route.
   */
  imageEditorOpenMode: "modal" | "standalone";
  /**
   * Warn before running a workflow that would execute more than
   * {@link largeRunThreshold} "heavy" nodes (LLM/model/provider/API nodes).
   * The "Run Workflow" button fires every executable node at once, so a large
   * graph can launch many provider calls; this guards against accidental runs.
   */
  confirmLargeRun: boolean;
  /** Heavy-node count above which the large-run warning is shown. */
  largeRunThreshold: number;
  /**
   * Realtime audio playback buffer in milliseconds. The live-monitoring
   * buffer between the synth graph and the speakers: smaller = lower
   * knob-to-ear latency, larger = more resilience against dropouts under
   * load. Applies to live patches (Audio Out node).
   */
  audioBufferMs: number;
  autosave: AutosaveSettings;
}

interface SettingsStore {
  settings: Settings;
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
  setSoundNotifications: (value: boolean) => void;
  setInstantUpdate: (value: boolean) => void;
  setEditorViewMode: (value: "graph" | "chain") => void;
  setImageEditorOpenMode: (value: "modal" | "standalone") => void;
  updateAutosaveSettings: (newSettings: Partial<AutosaveSettings>) => void;
}

export const defaultSettings: Settings = {
  gridSnap: 1,
  connectionSnap: 20,
  // On Mac the trackpad already pans (two-finger scroll) and zooms (pinch), so
  // left-drag is free to rubber-band select — the Figma/Sketch convention Mac
  // users expect. "RMB" mode makes left-drag select and moves pan to RMB/MMB.
  panControls: isMac() ? "RMB" : "LMB",
  selectionMode: "partial",
  workflowOrder: "name",
  dashboardWorkflowView: "grid",
  assetsOrder: "name",
  assetItemSize: 2,
  timeFormat: "12h",
  alertBeforeTabClose: true,
  selectNodesOnDrag: false,
  showWelcomeOnStartup: true,
  soundNotifications: true,
  instantUpdate: false,
  editorViewMode: "graph",
  imageEditorOpenMode: "modal",
  confirmLargeRun: true,
  largeRunThreshold: 5,
  audioBufferMs: 100,
  autosave: { ...defaultAutosaveSettings }
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: { ...defaultSettings },
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
      setSoundNotifications: (value: boolean) =>
        set((state) => ({
          settings: {
            ...state.settings,
            soundNotifications: value
          }
        })),
      setInstantUpdate: (value: boolean) =>
        set((state) => ({
          settings: {
            ...state.settings,
            instantUpdate: value
          }
        })),
      setEditorViewMode: (value: "graph" | "chain") =>
        set((state) => ({
          settings: {
            ...state.settings,
            editorViewMode: value
          }
        })),
      setImageEditorOpenMode: (value: "modal" | "standalone") =>
        set((state) => ({
          settings: {
            ...state.settings,
            imageEditorOpenMode: value
          }
        })),
      updateAutosaveSettings: (newSettings: Partial<AutosaveSettings>) =>
        set((state) => ({
          settings: {
            ...state.settings,
            autosave: { ...state.settings.autosave, ...newSettings }
          }
        }))
    }),
    {
      name: "settings-storage",
      partialize: (state) => ({
        settings: state.settings
        // Don't persist menuAnchorEl state
      }),
      // Merge persisted state with defaults to handle new settings being added
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsStore> | undefined;
        return {
          ...currentState,
          settings: {
            ...defaultSettings,
            ...persisted?.settings,
            // Deep merge autosave settings to ensure new defaults are included
            autosave: {
              ...defaultAutosaveSettings,
              ...persisted?.settings?.autosave
            }
          }
        };
      }
    }
  )
);
