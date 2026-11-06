/**
 * The live state of each `generate_batch` call, keyed by its tool-call id.
 *
 * Chat and app runs both feed it from `generation_batch_update` messages, so
 * the tool row that renders the call reads one place on either surface.
 */
import { create } from "zustand";
import type { GenerationBatchItem, GenerationBatchUpdate } from "@nodetool-ai/protocol";

export interface GenerationBatchState {
  concurrency: number;
  items: GenerationBatchItem[];
}

interface GenerationBatchStore {
  batches: Record<string, GenerationBatchState>;
  applyUpdate: (update: Pick<GenerationBatchUpdate, "tool_call_id" | "concurrency" | "items">) => void;
}

export const useGenerationBatchStore = create<GenerationBatchStore>((set) => ({
  batches: {},
  applyUpdate: (update) =>
    set((state) => ({
      batches: {
        ...state.batches,
        [update.tool_call_id]: { concurrency: update.concurrency, items: update.items }
      }
    }))
}));
