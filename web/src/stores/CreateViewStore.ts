/**
 * CreateViewStore
 *
 * What the Create view's prompt bar holds that is not a generation setting: the
 * mode, the prompt and how many takes one press starts. The settings themselves
 * (model, size, duration, presets) stay in MediaGenerationStore, so the bar
 * and the chat composer read the same model and resolution rather than two
 * copies that drift.
 *
 * The mode lives here, not in MediaGenerationStore, because that store's mode
 * belongs to the chat composer: changing it from the Create view would switch
 * the mode of every chat that has not chosen its own.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaMode } from "./MediaGenerationStore";

/** The modes the Create view submits. Each runs from a prompt alone. */
export const CREATE_MODES = ["image", "video"] as const satisfies readonly MediaMode[];

export type CreateMode = (typeof CREATE_MODES)[number];

export const isCreateMode = (mode: string | null | undefined): mode is CreateMode =>
  CREATE_MODES.some((candidate) => candidate === mode);

/** Takes one press can start, each its own `generate_media` request. */
export const CREATE_BATCH_OPTIONS = [1, 2, 3, 4] as const;

export const MAX_CREATE_BATCH = CREATE_BATCH_OPTIONS[CREATE_BATCH_OPTIONS.length - 1];

export const clampCreateBatch = (value: number): number =>
  Math.min(MAX_CREATE_BATCH, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));

interface CreateViewState {
  mode: CreateMode;
  prompt: string;
  batch: number;
  setMode: (mode: CreateMode) => void;
  setPrompt: (prompt: string) => void;
  setBatch: (batch: number) => void;
}

export const useCreateViewStore = create<CreateViewState>()(
  persist(
    (set) => ({
      mode: "image",
      prompt: "",
      batch: 1,
      setMode: (mode) => set({ mode }),
      setPrompt: (prompt) => set({ prompt }),
      setBatch: (batch) => set({ batch: clampCreateBatch(batch) })
    }),
    {
      name: "nodetool-create-view",
      version: 1,
      partialize: ({ mode, prompt, batch }) => ({ mode, prompt, batch }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<CreateViewState>;
        return {
          ...current,
          mode: isCreateMode(saved.mode) ? saved.mode : current.mode,
          prompt: typeof saved.prompt === "string" ? saved.prompt : current.prompt,
          batch: clampCreateBatch(saved.batch ?? current.batch)
        };
      }
    }
  )
);

export default useCreateViewStore;
