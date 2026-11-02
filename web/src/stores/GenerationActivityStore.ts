/**
 * GenerationActivityStore
 *
 * Every media generation the app starts or hears about, wherever it came from:
 * a `generate_media` request from an editor or a guided flow, a media turn in
 * chat, or a `prediction` a workflow run or a chat agent reports. The bottom
 * panel's Generations view lists them, so no surface draws its own queue.
 *
 * The store only records. `useGenerationActivityTracking` feeds it from the
 * socket, and the surface that started a generation still owns what happens
 * to its result.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkspaceTabType } from "./WorkspaceTabsStore";

export type GenerationActivityStatus =
  | "generating"
  | "generated"
  | "failed"
  | "cancelled";

/** How a generation was started, which decides how it can be stopped. */
export type GenerationActivityChannel =
  /** A `generate_media` request; stopped with `cancel_generation`. */
  | "rpc"
  /** A chat turn in a media mode; stopped by stopping the thread. */
  | "chat"
  /** A `prediction` from a workflow run or a chat agent's tool call. */
  | "prediction";

export type GenerationMediaKind = "image" | "video" | "audio" | "other";

/** The workspace document a generation belongs to, for "Open". */
export interface GenerationActivitySource {
  type: WorkspaceTabType;
  ref: string;
  title: string;
}

/**
 * The settings a `generate_media` request carried, without its prompt: mode,
 * provider, model, size, duration, seed and presets. A retake sends them again.
 */
export type GenerationRequestSettings = Record<string, unknown>;

export interface GenerationActivity {
  /** The request id, chat message id or prediction id. */
  id: string;
  channel: GenerationActivityChannel;
  preset_ids?: string[];
  /** Set for a `generate_media` request. */
  request?: GenerationRequestSettings;
  preset_warnings?: string[];
  status: GenerationActivityStatus;
  kind: GenerationMediaKind;
  /** The prompt as sent, when there was one. */
  prompt: string | null;
  model: string | null;
  source: GenerationActivitySource | null;
  /** Chat thread for the `chat` channel and chat predictions. */
  threadId: string | null;
  startedAt: number;
  endedAt: number | null;
  assetIds: string[];
  error: string | null;
}

/** Finished generations kept for the panel's history. Running ones are never dropped. */
export const GENERATION_HISTORY_LIMIT = 60;

interface GenerationActivityState {
  generations: Record<string, GenerationActivity>;
  /** Add a generation. A second start for the same id is ignored. */
  start: (generation: GenerationActivity) => void;
  /** Close a running generation. A settled one keeps its first outcome. */
  settle: (
    id: string,
    outcome: {
      status: Exclude<GenerationActivityStatus, "generating">;
      assetIds?: string[];
      error?: string | null;
    }
  ) => void;
  /** Drop generations, whatever their state. */
  remove: (ids: readonly string[]) => void;
  /** Drop every finished generation. */
  clearFinished: () => void;
}

/** Keep every running generation and the newest finished ones. */
export const pruneGenerations = (
  generations: Record<string, GenerationActivity>,
  limit: number = GENERATION_HISTORY_LIMIT
): Record<string, GenerationActivity> => {
  const finished = Object.values(generations)
    .filter((generation) => generation.status !== "generating")
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt));
  if (finished.length <= limit) {
    return generations;
  }
  const next = { ...generations };
  for (const generation of finished.slice(limit)) {
    delete next[generation.id];
  }
  return next;
};

/** Which media family a request mode or a prediction capability produces. */
export const mediaKindOf = (
  modeOrCapability: string | null | undefined
): GenerationMediaKind => {
  const value = modeOrCapability ?? "";
  if (/video|retake|extend|lip_sync|motion/.test(value)) {
    return "video";
  }
  if (/audio|speech|music|tts|voice/.test(value)) {
    return "audio";
  }
  if (/image|sketch|inpaint|outpaint|upscale/.test(value)) {
    return "image";
  }
  return "other";
};

export const useGenerationActivityStore = create<GenerationActivityState>()(
  persist(
    (set) => ({
      generations: {},
      start: (generation) =>
        set((state) =>
          state.generations[generation.id]
            ? state
            : {
                generations: pruneGenerations({
                  ...state.generations,
                  [generation.id]: generation
                })
              }
        ),
      settle: (id, outcome) =>
        set((state) => {
          const current = state.generations[id];
          if (!current || current.status !== "generating") {
            return state;
          }
          return {
            generations: pruneGenerations({
              ...state.generations,
              [id]: {
                ...current,
                status: outcome.status,
                assetIds: outcome.assetIds ?? current.assetIds,
                error: outcome.error ?? null,
                endedAt: Date.now()
              }
            })
          };
        }),
      remove: (ids) =>
        set((state) => {
          const next = { ...state.generations };
          for (const id of ids) {
            delete next[id];
          }
          return { generations: next };
        }),
      clearFinished: () =>
        set((state) => ({
          generations: Object.fromEntries(
            Object.entries(state.generations).filter(
              ([, generation]) => generation.status === "generating"
            )
          )
        }))
    }),
    {
      name: "generation-activity",
      version: 1,
      partialize: (state) => ({ generations: state.generations })
    }
  )
);
