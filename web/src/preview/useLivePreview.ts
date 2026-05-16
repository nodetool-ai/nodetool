/**
 * useLivePreview — react to client-side preview overlays for a node.
 *
 * The reader hook subscribes to a single node's overlay value. The companion
 * action hook (`useLivePreviewActions`) runs a cheap image op via the browser
 * runtime and writes the result into `livePreviewStore`. Drag-driven UIs
 * (sliders, number inputs) call `runPreview` on every change; an internal
 * debounce coalesces rapid bursts.
 *
 * For the spike this only supports `op === "resize"`. Other ops are stubs
 * pending the parity test landing.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLivePreviewStore } from "./livePreviewStore";
import type { LivePreviewValue } from "./livePreviewStore";

import { browserImageRuntime } from "./browserImageRuntime";
import type {
  ImageBytes,
  ResizeOptions
} from "./imageRuntimeContract";

export type LivePreviewOp = "resize";

export interface LivePreviewParams {
  width?: number;
  height?: number;
  filter?: ResizeOptions["filter"];
  fit?: ResizeOptions["fit"];
}

export interface LivePreviewImageValue {
  type: "image";
  data: Uint8Array;
  width?: number;
  height?: number;
  mimeType?: string;
}

const DEBOUNCE_MS = 16;

/** Read the current overlay for `nodeId`, if any. */
export function useLivePreview(nodeId: string): LivePreviewValue {
  return useLivePreviewStore((state) => state.previews[nodeId]);
}

interface LivePreviewActions {
  runPreview: (
    nodeId: string,
    op: LivePreviewOp,
    params: LivePreviewParams,
    sourceBytes: ImageBytes
  ) => Promise<void>;
  clear: (nodeId: string) => void;
}

/**
 * Returns stable action handles. Each call to `runPreview` debounces per-node;
 * a fresh call within DEBOUNCE_MS replaces the pending one (last-write-wins,
 * which is what slider drags want).
 */
export function useLivePreviewActions(): LivePreviewActions {
  const setPreview = useLivePreviewStore((state) => state.setPreview);
  const clearPreview = useLivePreviewStore((state) => state.clearPreview);

  // Per-node debounce + cancellation. We cancel the in-flight result rather
  // than racing — if a newer params has been requested, the older result is
  // discarded silently.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const tokensRef = useRef<Map<string, number>>(new Map());

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    },
    []
  );

  const runPreview = useCallback(
    async (
      nodeId: string,
      op: LivePreviewOp,
      params: LivePreviewParams,
      sourceBytes: ImageBytes
    ): Promise<void> => {
      const existingTimer = timersRef.current.get(nodeId);
      if (existingTimer) clearTimeout(existingTimer);

      return new Promise<void>((resolve) => {
        const timer = setTimeout(async () => {
          timersRef.current.delete(nodeId);
          const token = (tokensRef.current.get(nodeId) ?? 0) + 1;
          tokensRef.current.set(nodeId, token);

          try {
            if (op !== "resize") {
              resolve();
              return;
            }
            // TODO move to Worker — keeps the main thread free during drags.
            const result = await browserImageRuntime.resize(sourceBytes, {
              width: params.width,
              height: params.height,
              filter: params.filter,
              fit: params.fit
            });
            // Stale-token guard: a newer drag has superseded us.
            if (tokensRef.current.get(nodeId) !== token) {
              resolve();
              return;
            }
            const value: LivePreviewImageValue = {
              type: "image",
              data: result.data,
              width: result.width,
              height: result.height,
              mimeType: result.mimeType
            };
            setPreview(nodeId, value);
          } catch (err) {
            // Preview failures are non-fatal — the body falls back to the
            // last server result. Log so it's diagnosable.
            console.warn("[livePreview] op failed", { nodeId, op, err });
          }
          resolve();
        }, DEBOUNCE_MS);
        timersRef.current.set(nodeId, timer);
      });
    },
    [setPreview]
  );

  const clear = useCallback(
    (nodeId: string) => {
      const t = timersRef.current.get(nodeId);
      if (t) {
        clearTimeout(t);
        timersRef.current.delete(nodeId);
      }
      clearPreview(nodeId);
    },
    [clearPreview]
  );

  return useMemo(() => ({ runPreview, clear }), [runPreview, clear]);
}

export default useLivePreview;
