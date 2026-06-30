/**
 * Per-app reactive state store.
 *
 * One store instance backs one running app. Widgets subscribe to individual
 * state keys, so a streaming output that updates `state["result"]` re-renders
 * only the widgets bound to `result`. This is the reactive core: state in,
 * render out.
 */
import { createStore } from "zustand/vanilla";

export type RuntimeRunnerState =
  | "idle"
  | "connecting"
  | "running"
  | "error";

export interface RuntimeProgress {
  current: number;
  total: number;
}

export interface AppRuntimeState {
  /** Reactive values: workflow inputs, streamed outputs, and local UI vars. */
  values: Record<string, unknown>;
  runnerState: RuntimeRunnerState;
  progress: RuntimeProgress | null;
  error: string | null;
  lastRunDuration: number | null;

  setValue: (key: string, value: unknown) => void;
  setValues: (values: Record<string, unknown>) => void;
  toggleValue: (key: string) => void;
  setRunnerState: (state: RuntimeRunnerState) => void;
  setProgress: (progress: RuntimeProgress | null) => void;
  setError: (error: string | null) => void;
  setLastRunDuration: (duration: number | null) => void;
  /** Clear streamed outputs/progress/error before a fresh run (keeps inputs). */
  clearOutputs: (outputKeys: string[]) => void;
}

export type AppRuntimeStore = ReturnType<typeof createAppRuntimeStore>;

export const createAppRuntimeStore = (
  initialValues: Record<string, unknown> = {}
) =>
  createStore<AppRuntimeState>((set) => ({
    values: { ...initialValues },
    runnerState: "idle",
    progress: null,
    error: null,
    lastRunDuration: null,

    setValue: (key, value) =>
      set((s) => ({ values: { ...s.values, [key]: value } })),
    setValues: (values) =>
      set((s) => ({ values: { ...s.values, ...values } })),
    toggleValue: (key) =>
      set((s) => ({ values: { ...s.values, [key]: !s.values[key] } })),
    setRunnerState: (runnerState) => set({ runnerState }),
    setProgress: (progress) => set({ progress }),
    setError: (error) => set({ error }),
    setLastRunDuration: (lastRunDuration) => set({ lastRunDuration }),
    clearOutputs: (outputKeys) =>
      set((s) => {
        if (outputKeys.length === 0) {
          return { progress: null, error: null };
        }
        const values = { ...s.values };
        for (const key of outputKeys) {
          delete values[key];
        }
        return { values, progress: null, error: null };
      })
  }));
