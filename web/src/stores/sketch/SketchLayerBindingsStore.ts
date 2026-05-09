/**
 * SketchLayerBindingsStore
 *
 * Client-side mirror of `LayerWorkflowBinding[]` from the persisted image
 * document. Stores the per-layer workflow binding (workflow id, output node,
 * param overrides, dependency hashes, status, version history) and exposes
 * the mutators the inspector needs.
 *
 * Responsibilities:
 *   - Hold bindings keyed by `layerId`.
 *   - Recompute `dependencyHash` whenever param overrides or input asset
 *     references change (browser-friendly hash from `lib/sketch/dependencyHash`).
 *   - Recompute layer `status` from the binding's hashes + active job:
 *     `dependencyHash !== lastGeneratedHash && lastGeneratedHash` → "stale".
 *   - Note the latest generation result via `recordGeneratedVersion`, which
 *     advances `lastGeneratedHash` so the layer stops being stale.
 *
 * NOD-321 only wires the in-memory store; persistence/autosave lands later.
 */

import { create } from "zustand";
import type {
  LayerStatus,
  LayerVersion,
  LayerWorkflowBinding
} from "@nodetool-ai/image-editor";
import {
  computeLayerDependencyHash,
  type LayerDependencyHashInput
} from "../../lib/sketch/dependencyHash";

export type { LayerWorkflowBinding };

export interface RecordGeneratedVersionInput {
  /** Newly appended version (already persisted server-side). */
  version: LayerVersion;
  /** Hash recorded against the version — becomes the new `lastGeneratedHash`. */
  dependencyHash: string;
  /** Asset id resolved from the job output. */
  assetId: string;
}

interface SketchLayerBindingsState {
  /** Bindings keyed by `layerId`. */
  bindings: Record<string, LayerWorkflowBinding>;

  /** Replace all bindings (e.g. after document load). */
  setBindings: (bindings: LayerWorkflowBinding[]) => void;
  /** Add or replace a single binding (used after server-side create). */
  upsertBinding: (binding: LayerWorkflowBinding) => void;
  /** Remove a binding by layer id. */
  removeBinding: (layerId: string) => void;

  /** Look up a binding by layer id. */
  getBinding: (layerId: string) => LayerWorkflowBinding | undefined;

  /**
   * Update a single Input* override and recompute `dependencyHash`. Marks
   * the layer "stale" when the new hash differs from `lastGeneratedHash`.
   * No-op when the layer has no binding.
   */
  setParamOverride: (
    layerId: string,
    inputName: string,
    value: unknown
  ) => void;

  /** Update the bound workflow's selected output node. Marks stale. */
  setSelectedOutputNodeId: (
    layerId: string,
    selectedOutputNodeId: string
  ) => void;

  /**
   * Replace the set of input asset hashes used by the dependency hash
   * (e.g. when the inputs change because the source raster was repainted).
   * Marks the layer stale when the resulting hash differs from
   * `lastGeneratedHash`.
   */
  setInputAssetHashes: (layerId: string, hashes: string[]) => void;

  /** Force-mark a layer stale (e.g. when its bound workflow updates). */
  markStale: (layerId: string) => void;
  /** Update the layer's status without changing hashes. */
  setStatus: (layerId: string, status: LayerStatus) => void;

  /**
   * Record a successful generation result: appends the new version, sets
   * `lastGeneratedHash` from the version's hash, points `currentAssetId` at
   * the produced asset, and recomputes status (typically -> "generated").
   */
  recordGeneratedVersion: (
    layerId: string,
    input: RecordGeneratedVersionInput
  ) => void;

  /** Apply Input* drift: seed added inputs with defaults, drop removed ones. */
  applyInputDrift: (
    workflowId: string,
    added: Array<{ name: string; defaultValue: unknown }>,
    removed: string[]
  ) => void;

  /** Mark every binding referencing the workflow as stale. */
  markStaleForWorkflow: (workflowId: string) => void;

  /** Reset to an empty state. Test helper. */
  reset: () => void;
}

interface RecomputeContext {
  /** Asset hashes used as additional dependency-hash inputs. */
  inputAssetHashes?: string[];
}

const recomputeBinding = (
  binding: LayerWorkflowBinding,
  ctx: RecomputeContext = {}
): LayerWorkflowBinding => {
  // The bound workflow's `updated_at` is not stored client-side; workflow
  // graph drift propagates separately via `markStaleForWorkflow`. We fold the
  // selected output node id into the hash so changing it invalidates results.
  const hashInput: LayerDependencyHashInput = {
    workflowId: `${binding.workflowId}:${binding.selectedOutputNodeId ?? ""}`,
    workflowUpdatedAt: "",
    paramOverrides: binding.paramOverrides ?? {},
    inputAssetHashes: ctx.inputAssetHashes ?? []
  };
  const dependencyHash = computeLayerDependencyHash(hashInput);
  const status = deriveStatus({
    ...binding,
    dependencyHash
  });
  return { ...binding, dependencyHash, status };
};

function deriveStatus(binding: LayerWorkflowBinding): LayerStatus {
  if (binding.status === "queued" || binding.status === "generating") {
    return binding.status;
  }
  if (binding.status === "failed") {
    return "failed";
  }
  if (binding.status === "locked") {
    return "locked";
  }
  if (binding.status === "missing") {
    return "missing";
  }
  if (!binding.lastGeneratedHash) {
    return "draft";
  }
  if (binding.dependencyHash && binding.dependencyHash !== binding.lastGeneratedHash) {
    return "stale";
  }
  return "generated";
}

export const useSketchLayerBindingsStore = create<SketchLayerBindingsState>(
  (set, get) => ({
    bindings: {},

    setBindings: (incoming) =>
      set(() => ({
        bindings: Object.fromEntries(
          incoming.map((b) => [b.layerId, recomputeBinding(b)])
        )
      })),

    upsertBinding: (binding) =>
      set((state) => ({
        bindings: {
          ...state.bindings,
          [binding.layerId]: recomputeBinding(binding)
        }
      })),

    removeBinding: (layerId) =>
      set((state) => {
        if (!(layerId in state.bindings)) {
          return state;
        }
        const next = { ...state.bindings };
        delete next[layerId];
        return { bindings: next };
      }),

    getBinding: (layerId) => get().bindings[layerId],

    setParamOverride: (layerId, inputName, value) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        const nextOverrides = {
          ...(binding.paramOverrides ?? {}),
          [inputName]: value
        };
        const updated = recomputeBinding({
          ...binding,
          paramOverrides: nextOverrides
        });
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    setSelectedOutputNodeId: (layerId, selectedOutputNodeId) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding || binding.selectedOutputNodeId === selectedOutputNodeId) {
          return state;
        }
        const updated = recomputeBinding({
          ...binding,
          selectedOutputNodeId,
          // Selecting a different output node invalidates the previous result.
          status: "stale"
        });
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    setInputAssetHashes: (layerId, hashes) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        const updated = recomputeBinding(binding, { inputAssetHashes: hashes });
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    markStale: (layerId) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        return {
          bindings: {
            ...state.bindings,
            [layerId]: { ...binding, status: "stale" }
          }
        };
      }),

    setStatus: (layerId, status) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding || binding.status === status) {
          return state;
        }
        return {
          bindings: {
            ...state.bindings,
            [layerId]: { ...binding, status }
          }
        };
      }),

    recordGeneratedVersion: (layerId, input) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        const versions = [...binding.versions, input.version];
        const updated: LayerWorkflowBinding = {
          ...binding,
          versions,
          currentAssetId: input.assetId,
          lastGeneratedHash: input.dependencyHash,
          dependencyHash: input.dependencyHash,
          status: "generated"
        };
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    applyInputDrift: (workflowId, added, removed) =>
      set((state) => {
        let mutated = false;
        const removedSet = new Set(removed);
        const next: Record<string, LayerWorkflowBinding> = {};
        for (const [layerId, binding] of Object.entries(state.bindings)) {
          if (binding.workflowId !== workflowId) {
            next[layerId] = binding;
            continue;
          }
          const overrides = { ...(binding.paramOverrides ?? {}) };
          let touched = false;
          for (const key of Object.keys(overrides)) {
            if (removedSet.has(key)) {
              delete overrides[key];
              touched = true;
            }
          }
          for (const { name, defaultValue } of added) {
            if (!(name in overrides)) {
              overrides[name] = defaultValue;
              touched = true;
            }
          }
          if (!touched) {
            next[layerId] = binding;
            continue;
          }
          mutated = true;
          next[layerId] = recomputeBinding({
            ...binding,
            paramOverrides: overrides
          });
        }
        return mutated ? { bindings: next } : state;
      }),

    markStaleForWorkflow: (workflowId) =>
      set((state) => {
        let mutated = false;
        const next: Record<string, LayerWorkflowBinding> = {};
        for (const [layerId, binding] of Object.entries(state.bindings)) {
          if (
            binding.workflowId === workflowId &&
            binding.status !== "stale"
          ) {
            next[layerId] = { ...binding, status: "stale" };
            mutated = true;
          } else {
            next[layerId] = binding;
          }
        }
        return mutated ? { bindings: next } : state;
      }),

    reset: () => set({ bindings: {} })
  })
);

/** Convenience selector for a single binding. */
export const useLayerBinding = (
  layerId: string | null | undefined
): LayerWorkflowBinding | undefined =>
  useSketchLayerBindingsStore((state) =>
    layerId ? state.bindings[layerId] : undefined
  );
