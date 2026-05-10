/**
 * SketchLayerBindingsStore
 *
 * Client-side mirror of `LayerWorkflowBinding[]` from the persisted image
 * document. Stores the per-layer workflow binding (workflow id, output node,
 * param overrides, dependency hashes, status, version history) and the
 * extras the inspector needs (input asset hashes, workflow drift token).
 *
 * Responsibilities:
 *   - Hold bindings keyed by `layerId`.
 *   - Recompute `dependencyHash` whenever param overrides, input asset
 *     hashes, the selected output node, or the workflow drift token change
 *     (browser-friendly hash from `lib/sketch/dependencyHash`).
 *   - Recompute layer `status` from the binding's hashes:
 *     `dependencyHash !== lastGeneratedHash && lastGeneratedHash` → "stale".
 *   - Note the latest generation result via `recordGeneratedVersion`, which
 *     advances `lastGeneratedHash` so the layer stops being stale.
 *
 * Asset hashes and the workflow drift token are kept in a parallel
 * `extras` map keyed by layer id. They are not part of the persisted
 * `LayerWorkflowBinding` shape but are folded into every recompute, so a
 * later `setParamOverride` cannot accidentally drop earlier asset-hash or
 * workflow-drift inputs and flip the binding back to "generated".
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

/**
 * Per-layer values that affect the dependency hash but are not part of the
 * `LayerWorkflowBinding` shape persisted on the server.
 */
interface LayerHashExtras {
  /** Sorted-but-otherwise-opaque hashes of input assets fed into the layer. */
  inputAssetHashes: string[];
  /**
   * Monotonically increasing token bumped by `markStaleForWorkflow` to
   * invalidate every binding referencing a workflow whose graph has drifted.
   * Folded into the dependency hash so the staleness survives any later
   * recompute path (e.g. `setParamOverride`).
   */
  workflowDriftToken: number;
}

const EMPTY_EXTRAS: LayerHashExtras = {
  inputAssetHashes: [],
  workflowDriftToken: 0
};

interface SketchLayerBindingsState {
  /** Bindings keyed by `layerId`. */
  bindings: Record<string, LayerWorkflowBinding>;
  /** Per-layer hash inputs that aren't part of the persisted binding. */
  extras: Record<string, LayerHashExtras>;

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
   * The hashes are persisted in `extras` so they participate in every
   * subsequent recompute, not just this one.
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

  /**
   * Mark every binding referencing the workflow as stale. Bumps each
   * affected layer's drift token so the staleness is encoded in the
   * dependency hash and survives later recomputes until the next
   * `recordGeneratedVersion`.
   */
  markStaleForWorkflow: (workflowId: string) => void;

  /**
   * Restore a previous version: points `currentAssetId` and
   * `paramOverrides` at the version's snapshot, sets `lastGeneratedHash`
   * from the version's hash, and recomputes status (typically "generated"
   * if the recomputed dependency hash matches, else "stale"). No-op on
   * non-success versions or unknown ids.
   */
  restoreVersion: (layerId: string, versionId: string) => void;

  /** Toggle the locked flag — successful generations skip locked layers. */
  setLocked: (layerId: string, locked: boolean) => void;

  /**
   * Revert a generated layer to an empty draft: clears `currentAssetId`,
   * `lastGeneratedHash`, and resets status to "draft". Versions are kept
   * so the user can still restore them.
   */
  revert: (layerId: string) => void;

  /**
   * Replace the entire `paramOverrides` map for a layer (e.g. version
   * restore). Recomputes the dependency hash and status.
   */
  setParamOverrides: (
    layerId: string,
    paramOverrides: Record<string, unknown>
  ) => void;

  /**
   * Apply a new `selectedOutputNodeId` to every binding referencing the
   * given workflow id. Also marks affected bindings stale through the
   * recompute path.
   */
  setBindingsOutputNode: (
    workflowId: string,
    selectedOutputNodeId: string
  ) => void;

  /** Reset to an empty state. Test helper. */
  reset: () => void;
}

const recomputeBinding = (
  binding: LayerWorkflowBinding,
  extras: LayerHashExtras
): LayerWorkflowBinding => {
  // The bound workflow's `updated_at` is not stored client-side; workflow
  // graph drift is tracked separately via the per-layer `workflowDriftToken`.
  // We fold the selected output node id and drift token into the hash so
  // any change there invalidates the previously generated result.
  const hashInput: LayerDependencyHashInput = {
    workflowId: `${binding.workflowId}:${binding.selectedOutputNodeId ?? ""}:${extras.workflowDriftToken}`,
    workflowUpdatedAt: "",
    paramOverrides: binding.paramOverrides ?? {},
    inputAssetHashes: extras.inputAssetHashes
  };
  const dependencyHash = computeLayerDependencyHash(hashInput);
  const status = deriveStatus({ ...binding, dependencyHash });
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
  if (
    binding.dependencyHash &&
    binding.dependencyHash !== binding.lastGeneratedHash
  ) {
    return "stale";
  }
  return "generated";
}

const getExtras = (
  extras: Record<string, LayerHashExtras>,
  layerId: string
): LayerHashExtras => extras[layerId] ?? EMPTY_EXTRAS;

export const useSketchLayerBindingsStore = create<SketchLayerBindingsState>(
  (set, get) => ({
    bindings: {},
    extras: {},

    setBindings: (incoming) =>
      set(() => {
        // Loading bindings from the persisted document resets per-layer
        // hash extras: any in-memory drift token / asset hashes belonged to
        // the previous document.
        const nextBindings: Record<string, LayerWorkflowBinding> = {};
        const nextExtras: Record<string, LayerHashExtras> = {};
        for (const b of incoming) {
          nextExtras[b.layerId] = { ...EMPTY_EXTRAS };
          nextBindings[b.layerId] = recomputeBinding(b, nextExtras[b.layerId]);
        }
        return { bindings: nextBindings, extras: nextExtras };
      }),

    upsertBinding: (binding) =>
      set((state) => {
        const extras = getExtras(state.extras, binding.layerId);
        return {
          bindings: {
            ...state.bindings,
            [binding.layerId]: recomputeBinding(binding, extras)
          },
          extras: state.extras[binding.layerId]
            ? state.extras
            : { ...state.extras, [binding.layerId]: { ...EMPTY_EXTRAS } }
        };
      }),

    removeBinding: (layerId) =>
      set((state) => {
        if (!(layerId in state.bindings)) {
          return state;
        }
        const nextBindings = { ...state.bindings };
        delete nextBindings[layerId];
        const nextExtras = { ...state.extras };
        delete nextExtras[layerId];
        return { bindings: nextBindings, extras: nextExtras };
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
        const updated = recomputeBinding(
          { ...binding, paramOverrides: nextOverrides },
          getExtras(state.extras, layerId)
        );
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    setSelectedOutputNodeId: (layerId, selectedOutputNodeId) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding || binding.selectedOutputNodeId === selectedOutputNodeId) {
          return state;
        }
        // Selecting a different output node invalidates the previous result;
        // the hash recompute already encodes the change so `deriveStatus`
        // will surface "stale" once a `lastGeneratedHash` exists.
        const updated = recomputeBinding(
          { ...binding, selectedOutputNodeId },
          getExtras(state.extras, layerId)
        );
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    setInputAssetHashes: (layerId, hashes) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        const prev = getExtras(state.extras, layerId);
        const nextExtras: LayerHashExtras = {
          ...prev,
          inputAssetHashes: [...hashes]
        };
        const updated = recomputeBinding(binding, nextExtras);
        return {
          bindings: { ...state.bindings, [layerId]: updated },
          extras: { ...state.extras, [layerId]: nextExtras }
        };
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
        const nextBindings: Record<string, LayerWorkflowBinding> = {};
        for (const [layerId, binding] of Object.entries(state.bindings)) {
          if (binding.workflowId !== workflowId) {
            nextBindings[layerId] = binding;
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
            nextBindings[layerId] = binding;
            continue;
          }
          mutated = true;
          nextBindings[layerId] = recomputeBinding(
            { ...binding, paramOverrides: overrides },
            getExtras(state.extras, layerId)
          );
        }
        return mutated ? { bindings: nextBindings } : state;
      }),

    markStaleForWorkflow: (workflowId) =>
      set((state) => {
        let mutated = false;
        const nextBindings: Record<string, LayerWorkflowBinding> = {};
        const nextExtras: Record<string, LayerHashExtras> = { ...state.extras };
        for (const [layerId, binding] of Object.entries(state.bindings)) {
          if (binding.workflowId !== workflowId) {
            nextBindings[layerId] = binding;
            continue;
          }
          // Bumping the drift token forces the recomputed `dependencyHash`
          // to differ from `lastGeneratedHash` until the next successful
          // generation, so a later `setParamOverride` cannot accidentally
          // flip the binding back to "generated".
          const prev = getExtras(state.extras, layerId);
          const bumped: LayerHashExtras = {
            ...prev,
            workflowDriftToken: prev.workflowDriftToken + 1
          };
          nextExtras[layerId] = bumped;
          nextBindings[layerId] = recomputeBinding(binding, bumped);
          mutated = true;
        }
        return mutated
          ? { bindings: nextBindings, extras: nextExtras }
          : state;
      }),

    restoreVersion: (layerId, versionId) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        const version = binding.versions.find((v) => v.id === versionId);
        if (!version || version.status !== "success") {
          return state;
        }
        // Restore the snapshotted overrides + asset, then recompute so the
        // status flips to "generated" (hash matches) or "stale" (the live
        // dependency hash drifted past the restored one).
        const restored: LayerWorkflowBinding = {
          ...binding,
          currentAssetId: version.assetId,
          paramOverrides: { ...version.paramOverridesSnapshot },
          lastGeneratedHash: version.dependencyHash
        };
        const updated = recomputeBinding(
          restored,
          getExtras(state.extras, layerId)
        );
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    setLocked: (layerId, locked) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        if (locked) {
          if (binding.status === "locked") {
            return state;
          }
          return {
            bindings: {
              ...state.bindings,
              [layerId]: { ...binding, status: "locked" }
            }
          };
        }
        // Unlocking: re-derive status from the binding's hashes.
        const cleared: LayerWorkflowBinding = { ...binding, status: "draft" };
        const updated = recomputeBinding(
          cleared,
          getExtras(state.extras, layerId)
        );
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    revert: (layerId) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        const reverted: LayerWorkflowBinding = {
          ...binding,
          currentAssetId: undefined,
          lastGeneratedHash: undefined,
          status: "draft"
        };
        const updated = recomputeBinding(
          reverted,
          getExtras(state.extras, layerId)
        );
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    setParamOverrides: (layerId, paramOverrides) =>
      set((state) => {
        const binding = state.bindings[layerId];
        if (!binding) {
          return state;
        }
        const updated = recomputeBinding(
          { ...binding, paramOverrides: { ...paramOverrides } },
          getExtras(state.extras, layerId)
        );
        return { bindings: { ...state.bindings, [layerId]: updated } };
      }),

    setBindingsOutputNode: (workflowId, selectedOutputNodeId) =>
      set((state) => {
        let mutated = false;
        const nextBindings: Record<string, LayerWorkflowBinding> = {};
        for (const [layerId, binding] of Object.entries(state.bindings)) {
          if (
            binding.workflowId !== workflowId ||
            binding.selectedOutputNodeId === selectedOutputNodeId
          ) {
            nextBindings[layerId] = binding;
            continue;
          }
          mutated = true;
          nextBindings[layerId] = recomputeBinding(
            { ...binding, selectedOutputNodeId },
            getExtras(state.extras, layerId)
          );
        }
        return mutated ? { bindings: nextBindings } : state;
      }),

    reset: () => set({ bindings: {}, extras: {} })
  })
);

/** Convenience selector for a single binding. */
export const useLayerBinding = (
  layerId: string | null | undefined
): LayerWorkflowBinding | undefined =>
  useSketchLayerBindingsStore((state) =>
    layerId ? state.bindings[layerId] : undefined
  );
