/**
 * EffectsGalleryStore
 *
 * The Effects gallery's working state: the picture, the chosen effect and the
 * last run. It lives outside the page so closing the tab never drops the
 * picture or hides a result that arrives after (UX Guidelines 3.1). A run that
 * is still going keeps writing here while the tab is closed. The Generations
 * panel lists the same run, because the request goes through `generate_media`.
 */
import { create } from "zustand";

import type { GenerateMediaRequest } from "@nodetool-ai/protocol";
import { rpcRequest } from "../lib/websocket/rpcRequest";
import { useLastModelStore } from "./lastModelStore";

/** A video render may take minutes. */
export const EFFECT_RUN_TIMEOUT_MS = 10 * 60_000;

export type EffectRunStatus = "idle" | "running" | "done" | "failed";

export interface EffectRun {
  status: EffectRunStatus;
  effectId: string | null;
  /** The picture the run started from, so a result is never shown over another. */
  sourceAssetId: string | null;
  assetIds: string[];
  error: string | null;
}

const IDLE_RUN: EffectRun = {
  status: "idle",
  effectId: null,
  sourceAssetId: null,
  assetIds: [],
  error: null
};

/** The studio the gallery was opened from, and the effects it shows. */
export interface EffectsStudioScope {
  studioId: string;
  effectIds: string[];
}

interface EffectsGalleryState {
  sourceAssetId: string | null;
  effectId: string | null;
  /** Null shows every effect. */
  studio: EffectsStudioScope | null;
  run: EffectRun;
  setSourceAssetId: (assetId: string | null) => void;
  selectEffect: (effectId: string | null) => void;
  /**
   * Show only a studio's effects, with the first one chosen unless the chosen
   * effect is among them. An empty list shows every effect.
   */
  openStudio: (studioId: string, effectIds: readonly string[]) => void;
  /** Show every effect again, keeping the chosen one. */
  showAllEffects: () => void;
  /**
   * Send one effect request. `remember` records the model once it has
   * produced a result, so the next visit starts on it.
   */
  start: (
    request: GenerateMediaRequest,
    remember: { kind: "video" | "image"; task: string }
  ) => Promise<void>;
  /** Forget the last run and its error. */
  clearRun: () => void;
}

let current: AbortController | null = null;

const reasonOf = (cause: unknown): string =>
  cause instanceof Error && cause.message ? cause.message : "";

export const useEffectsGalleryStore = create<EffectsGalleryState>()((set) => ({
  sourceAssetId: null,
  effectId: null,
  studio: null,
  run: IDLE_RUN,
  setSourceAssetId: (sourceAssetId) =>
    set((state) => ({
      sourceAssetId,
      // A fixed error is about the old picture, so a new one starts clean.
      run: state.run.status === "running" ? state.run : IDLE_RUN
    })),
  selectEffect: (effectId) =>
    set((state) => ({
      effectId,
      run: state.run.status === "running" ? state.run : IDLE_RUN
    })),
  openStudio: (studioId, effectIds) =>
    set((state) => {
      if (effectIds.length === 0) {
        return { studio: null };
      }
      const studio = { studioId, effectIds: [...effectIds] };
      if (state.effectId !== null && effectIds.includes(state.effectId)) {
        return { studio };
      }
      return {
        studio,
        effectId: effectIds[0],
        run: state.run.status === "running" ? state.run : IDLE_RUN
      };
    }),
  showAllEffects: () => set({ studio: null }),
  start: async (request, remember) => {
    current?.abort();
    const controller = new AbortController();
    current = controller;
    const effectId = request.preset_ids?.[0] ?? null;
    const sourceAssetId = request.source_asset_id ?? null;
    set({
      run: { status: "running", effectId, sourceAssetId, assetIds: [], error: null }
    });
    try {
      const answer = await rpcRequest(
        "generate_media",
        request,
        EFFECT_RUN_TIMEOUT_MS,
        controller.signal
      );
      if (controller.signal.aborted) {
        return;
      }
      const assetIds = Array.isArray(answer.asset_ids)
        ? answer.asset_ids.filter((id): id is string => typeof id === "string")
        : [];
      if (assetIds.length === 0) {
        set({
          run: {
            status: "failed",
            effectId,
            sourceAssetId,
            assetIds: [],
            error: ""
          }
        });
        return;
      }
      if (request.provider && request.model) {
        const model = { provider: request.provider, model: request.model };
        const store = useLastModelStore.getState();
        store.remember(remember.kind, model);
        store.rememberForTask(remember.kind, remember.task, model);
      }
      set({
        run: { status: "done", effectId, sourceAssetId, assetIds, error: null }
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        return;
      }
      set({
        run: {
          status: "failed",
          effectId,
          sourceAssetId,
          assetIds: [],
          error: reasonOf(cause)
        }
      });
    } finally {
      if (current === controller) {
        current = null;
      }
    }
  },
  clearRun: () => set({ run: IDLE_RUN })
}));
