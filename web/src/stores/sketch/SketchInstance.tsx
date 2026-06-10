/**
 * SketchInstance
 *
 * Per-instance state wiring for the sketch editor. Each editor surface — a
 * workspace sketch tab, the standalone `/sketch/:id` page, or the in-node
 * sketch modal — gets its own isolated bundle of stores so several documents
 * can be edited in parallel without sharing layers, history, viewport, tool,
 * document metadata, or canvas refs.
 *
 * Mirrors the `NodeStore` / `NodeContext` pattern used by the node editor:
 *   - factory functions (`createSketchStore`, …) build a fresh store,
 *   - a React context carries the active instance to the subtree,
 *   - `SketchProvider` creates one instance and provides it,
 *   - hooks (`useSketchStore`, …) read reactively from the context instance.
 *
 * The hooks keep their original names/import paths, so the many
 * `useSketchStore(selector)` call sites are untouched. Their imperative
 * statics (`.getState()` / `.setState()` / `.subscribe()`) — used by the
 * non-React tool/shortcut modules and event handlers — forward to the
 * *currently active* instance (the focused editor), tracked via an activation
 * stack that `SketchProvider` pushes/pops.
 *
 * Generation-job state (`useSketchGenerationStore`) stays a singleton: its
 * entries are keyed by globally-unique layer ids, so parallel documents never
 * collide there.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo
} from "react";
import { createInstanceHook } from "../instanceStoreHook";

import {
  createSketchStore,
  type SketchStore,
  type SketchStoreApi
} from "../../components/sketch/state/useSketchStore";
import {
  createSketchSessionStore,
  type SketchSessionState,
  type SketchSessionStoreApi
} from "./SketchSessionStore";
import {
  createSketchCanvasRefStore,
  type SketchCanvasRefState,
  type SketchCanvasRefStoreApi
} from "./SketchCanvasRefStore";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

// ── Instance bundle ─────────────────────────────────────────────────────────

export interface SketchInstance {
  editor: SketchStoreApi;
  session: SketchSessionStoreApi;
  canvasRef: SketchCanvasRefStoreApi;
  /** Shared save-in-flight guard: prevents autosave and manual save from racing. */
  saveInFlight: { current: boolean };
}

const createSketchInstance = (): SketchInstance => ({
  editor: createSketchStore(),
  session: createSketchSessionStore(),
  canvasRef: createSketchCanvasRefStore(),
  saveInFlight: { current: false }
});

// A lazily-built default instance backs hooks used outside any provider
// (unit tests, and any legacy mount that has not been wrapped yet).
let defaultInstance: SketchInstance | null = null;
const getDefaultInstance = (): SketchInstance =>
  (defaultInstance ??= createSketchInstance());

// ── Activation stack ────────────────────────────────────────────────────────
// The "current" instance is the top of the stack: the most recently activated
// editor surface. Imperative statics resolve against it.

const activationStack: SketchInstance[] = [];

const pushActive = (instance: SketchInstance): void => {
  activationStack.push(instance);
};

const popActive = (instance: SketchInstance): void => {
  const idx = activationStack.lastIndexOf(instance);
  if (idx !== -1) activationStack.splice(idx, 1);
};

const currentInstance = (): SketchInstance =>
  activationStack[activationStack.length - 1] ?? getDefaultInstance();

// ── Context ─────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __SKETCH_CONTEXT__?: React.Context<SketchInstance | null>;
  }
}

const __HMR__ =
  typeof window !== "undefined" &&
  process.env.NODE_ENV !== "production" &&
  process.env.NODE_ENV !== "test";

const SketchContext: React.Context<SketchInstance | null> = (() => {
  if (__HMR__ && window.__SKETCH_CONTEXT__) {
    return window.__SKETCH_CONTEXT__;
  }
  const ctx = createContext<SketchInstance | null>(null);
  if (__HMR__) {
    window.__SKETCH_CONTEXT__ = ctx;
  }
  return ctx;
})();

/** The instance for the surrounding provider, or the shared default. */
export const useSketchInstance = (): SketchInstance =>
  useContext(SketchContext) ?? getDefaultInstance();

interface SketchProviderProps {
  /**
   * Whether this surface is the focused/visible one. While active, the
   * instance is the target of imperative statics (tools, keyboard, save
   * button). Defaults to `true` for always-focused surfaces (page, modal).
   */
  active?: boolean;
  children: React.ReactNode;
}

export const SketchProvider = ({
  active = true,
  children
}: SketchProviderProps) => {
  const instance = useMemo(() => createSketchInstance(), []);

  useEffect(() => {
    if (!active) return;
    pushActive(instance);
    return () => popActive(instance);
  }, [active, instance]);

  return (
    <SketchContext.Provider value={instance}>
      {children}
    </SketchContext.Provider>
  );
};

// ── Store hooks ─────────────────────────────────────────────────────────────

// Editor ----------------------------------------------------------------------

export const useSketchStore = createInstanceHook<SketchStore>(
  () => useSketchInstance().editor,
  () => currentInstance().editor
);

/** Raw editor store for the surrounding instance (imperative `.getState()`). */
export const useSketchStoreApi = (): SketchStoreApi =>
  useSketchInstance().editor;

// Session ---------------------------------------------------------------------

export const useSketchSessionStore = createInstanceHook<SketchSessionState>(
  () => useSketchInstance().session,
  () => currentInstance().session
);

/** Raw session store for the surrounding instance. */
export const useSketchSessionStoreApi = (): SketchSessionStoreApi =>
  useSketchInstance().session;

/** Convenience selector for a single layer's workflow binding. */
export const useLayerBinding = (
  layerId: string | null | undefined
): LayerWorkflowBinding | undefined =>
  useSketchSessionStore((state) =>
    layerId ? state.bindings[layerId] : undefined
  );

// Canvas refs -----------------------------------------------------------------

export const useSketchCanvasRefStore =
  createInstanceHook<SketchCanvasRefState>(
    () => useSketchInstance().canvasRef,
    () => currentInstance().canvasRef
  );

