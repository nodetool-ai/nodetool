import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE, resolveLocale, type Locale } from "../i18n/locales";
import { isMac } from "../utils/platform";
import {
  DEFAULT_TEXT_SIZE,
  isTextSize,
  type TextSize
} from "../components/themes/textSizes";
import {
  DEFAULT_THEME_CONTRAST,
  isThemeContrast,
  type ThemeContrast
} from "../components/themes/themeContrasts";

interface AutosaveSettings {
  enabled: boolean;
  intervalMinutes: number; // 1-60, default 10
  saveBeforeRun: boolean;
  saveOnClose: boolean;
  maxVersionsPerWorkflow: number; // default 50
  keepManualVersionsDays: number; // default 90
  keepAutosaveVersionsDays: number; // default 7
}

export const defaultAutosaveSettings: AutosaveSettings = {
  enabled: true,
  intervalMinutes: 10,
  saveBeforeRun: true,
  saveOnClose: true,
  maxVersionsPerWorkflow: 50,
  keepManualVersionsDays: 90,
  keepAutosaveVersionsDays: 7
};

export interface Settings {
  locale: Locale;
  /** Snap nodes to the canvas grid while dragging. Toggled from the View menu. */
  snapToGrid: boolean;
  /** Grid size in canvas units used when {@link snapToGrid} is on. */
  gridSnap: number;
  connectionSnap: number;
  panControls: string;
  selectionMode: string;
  workflowOrder: "name" | "date";
  assetsOrder: "name" | "date" | "size";
  assetItemSize: number;
  timeFormat: "12h" | "24h";
  /** App-wide text size, picked under Settings > General > Appearance. */
  textSize: TextSize;
  /** Standard or soft theme contrast, picked under Settings > General > Appearance. */
  themeContrast: ThemeContrast;
  alertBeforeTabClose: boolean;
  selectNodesOnDrag: boolean;
  soundNotifications: boolean;
  /**
   * Show a desktop notification when a run or chat reply finishes while
   * NodeTool is not focused.
   */
  systemNotifications: boolean;
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
  /** Which editor's keyboard layout the timeline follows. */
  timelineKeyboardPreset: "nodetool" | "premiere" | "fcp";
  /**
   * Where the timeline preview gets its video frames. `"element"` plays
   * `<video>` elements, `"webcodecs"` decodes with WebCodecs. A clip with a
   * ready proxy decodes with WebCodecs under both values.
   */
  timelinePreviewDecoder: "element" | "webcodecs";
  /**
   * Offer nodes whose provider needs an API key that is not set. Off by
   * default, so the node menu and library list only nodes that can run.
   */
  showNodesWithoutKey: boolean;
  autosave: AutosaveSettings;
}

interface SettingsStore {
  settings: Settings;
  setSnapToGrid: (value: boolean) => void;
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
  setTextSize: (value: TextSize) => void;
  setThemeContrast: (value: ThemeContrast) => void;
  setAlertBeforeTabClose: (value: boolean) => void;
  setSelectNodesOnDrag: (value: boolean) => void;
  setSoundNotifications: (value: boolean) => void;
  setSystemNotifications: (value: boolean) => void;
  setInstantUpdate: (value: boolean) => void;
  setEditorViewMode: (value: "graph" | "chain") => void;
  updateAutosaveSettings: (newSettings: Partial<AutosaveSettings>) => void;
}

export const defaultSettings: Settings = {
  locale: DEFAULT_LOCALE,
  snapToGrid: false,
  // Matches the canvas background grid gap, so a snapped node lands on a
  // visible grid crossing.
  gridSnap: 25,
  connectionSnap: 20,
  // On Mac the trackpad already pans (two-finger scroll) and zooms (pinch), so
  // left-drag is free to rubber-band select — the Figma/Sketch convention Mac
  // users expect. "RMB" mode makes left-drag select and moves pan to RMB/MMB.
  panControls: isMac() ? "RMB" : "LMB",
  selectionMode: "partial",
  workflowOrder: "name",
  assetsOrder: "name",
  assetItemSize: 2,
  timeFormat: "12h",
  textSize: DEFAULT_TEXT_SIZE,
  themeContrast: DEFAULT_THEME_CONTRAST,
  alertBeforeTabClose: true,
  selectNodesOnDrag: false,
  soundNotifications: true,
  systemNotifications: true,
  instantUpdate: false,
  editorViewMode: "graph",
  imageEditorOpenMode: "modal",
  confirmLargeRun: true,
  largeRunThreshold: 5,
  audioBufferMs: 100,
  timelineKeyboardPreset: "nodetool",
  timelinePreviewDecoder: "element",
  showNodesWithoutKey: false,
  autosave: { ...defaultAutosaveSettings }
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: { ...defaultSettings },
      setSnapToGrid: (value: boolean) =>
        set((state) => ({
          settings: { ...state.settings, snapToGrid: value }
        })),

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

      setTextSize: (value: TextSize) =>
        set((state) => ({
          settings: {
            ...state.settings,
            textSize: isTextSize(value) ? value : DEFAULT_TEXT_SIZE
          }
        })),

      setThemeContrast: (value: ThemeContrast) =>
        set((state) => ({
          settings: {
            ...state.settings,
            themeContrast: isThemeContrast(value)
              ? value
              : DEFAULT_THEME_CONTRAST
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
          settings: {
            ...state.settings,
            ...newSettings,
            locale: resolveLocale(newSettings.locale ?? state.settings.locale)
          }
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
      setSoundNotifications: (value: boolean) =>
        set((state) => ({
          settings: {
            ...state.settings,
            soundNotifications: value
          }
        })),
      setSystemNotifications: (value: boolean) =>
        set((state) => ({
          settings: {
            ...state.settings,
            systemNotifications: value
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
      }),
      // Merge persisted state with defaults so newly-added settings get their defaults.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsStore> | undefined;
        const persistedSettings = persisted?.settings;
        // Before the "Snap to Grid" toggle existed, snapping was always on and
        // the grid defaulted to 1 — a value that snaps to nothing. Installs
        // carrying that leftover get the new grid size, not a toggle that does
        // nothing when switched on.
        const legacyGridSnap =
          persistedSettings !== undefined &&
          persistedSettings.snapToGrid === undefined &&
          persistedSettings.gridSnap === 1;
        const settings: Settings = {
          ...defaultSettings,
          ...persistedSettings,
          // Deep merge autosave settings to ensure new defaults are included
          autosave: {
            ...defaultAutosaveSettings,
            ...persistedSettings?.autosave
          }
        };
        if (legacyGridSnap) {
          settings.gridSnap = defaultSettings.gridSnap;
        }
        settings.locale = resolveLocale(settings.locale);
        if (!isTextSize(settings.textSize)) {
          settings.textSize = DEFAULT_TEXT_SIZE;
        }
        if (!isThemeContrast(settings.themeContrast)) {
          settings.themeContrast = DEFAULT_THEME_CONTRAST;
        }
        return { ...currentState, settings };
      }
    }
  )
);
