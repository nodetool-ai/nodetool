/**
 * useRuntimeBootstrap
 *
 * Manages the SketchRuntime lifecycle:
 * - Canvas2D immediate startup
 * - Async WebGPU upgrade with fallback
 * - Device-loss recovery
 * - Zoom synchronisation
 */

import { useEffect, useRef, useState } from "react";
import type { SketchRuntime } from "../rendering";
import { Canvas2DRuntime, createRuntime, isWebGPUAvailable } from "../rendering";

export interface UseRuntimeBootstrapParams {
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  /** Stable ref whose `.current` is called after init / recovery to trigger a composite. */
  requestRedrawRef: React.MutableRefObject<() => void>;
  externalZoom: number;
}

export interface UseRuntimeBootstrapResult {
  runtimeRef: React.MutableRefObject<SketchRuntime | null>;
  runtime: SketchRuntime;
  backend: "webgpu" | "canvas2d";
  bootstrapPhaseActive: boolean;
}

export function useRuntimeBootstrap({
  layerCanvasesRef,
  requestRedrawRef,
  externalZoom
}: UseRuntimeBootstrapParams): UseRuntimeBootstrapResult {
  const runtimeRef = useRef<SketchRuntime | null>(null);
  const [backend, setBackend] = useState<"webgpu" | "canvas2d">("canvas2d");

  const [webgpuBootstrapPending, setWebgpuBootstrapPending] = useState(
    () => isWebGPUAvailable()
  );
  const bootstrapPhaseActive = webgpuBootstrapPending && isWebGPUAvailable();

  if (!runtimeRef.current) {
    runtimeRef.current = new Canvas2DRuntime(layerCanvasesRef.current);
  }
  const runtime: SketchRuntime = runtimeRef.current;

  // Keep zoom in sync on the runtime so the checkerboard pattern
  // can maintain a constant visual size regardless of the zoom level.
  const rt = runtimeRef.current as { zoom?: number };
  if (typeof rt.zoom === "number") {
    rt.zoom = externalZoom;
  }

  // Try to upgrade to WebGPU on mount
  useEffect(() => {
    let cancelled = false;

    /**
     * Attempt to re-initialize WebGPU after device loss. On success, swap the
     * runtime back to WebGPU. On failure, stay on Canvas2D (no further retries).
     */
    const attemptWebGPURecovery = () => {
      if (cancelled) {
        return;
      }
      const RECOVERY_DELAY_MS = 1000;
      setTimeout(() => {
        if (cancelled) {
          return;
        }
        console.info("[Sketch] Attempting WebGPU re-initialization after device loss…");
        createRuntime(layerCanvasesRef.current, handleDeviceLost).then(
          ({ runtime: recoveredRuntime, backend: recoveredBackend }) => {
            if (cancelled) {
              return;
            }
            if (recoveredBackend === "webgpu") {
              console.info("[Sketch] WebGPU recovered successfully");
              runtimeRef.current = recoveredRuntime;
              setBackend("webgpu");
              for (const layerId of layerCanvasesRef.current.keys()) {
                recoveredRuntime.invalidateLayer(layerId);
              }
              requestAnimationFrame(() => {
                if (!cancelled) {
                  requestRedrawRef.current();
                }
              });
            } else {
              console.warn("[Sketch] WebGPU recovery failed — staying on Canvas2D");
            }
          }
        );
      }, RECOVERY_DELAY_MS);
    };

    // Device-loss handler: immediately fall back to Canvas2D, then try to
    // recover WebGPU in the background.
    const handleDeviceLost = () => {
      if (cancelled) {
        return;
      }
      console.warn("[Sketch] WebGPU device lost — falling back to Canvas2D");
      const fallback = new Canvas2DRuntime(layerCanvasesRef.current);
      runtimeRef.current = fallback;
      setBackend("canvas2d");
      requestAnimationFrame(() => {
        if (!cancelled) {
          requestRedrawRef.current();
        }
      });
      attemptWebGPURecovery();
    };

    createRuntime(layerCanvasesRef.current, handleDeviceLost).then(
      ({ runtime: newRuntime, backend: newBackend }) => {
        if (cancelled) {
          void newRuntime;
          return;
        }
        setWebgpuBootstrapPending(false);

        if (newBackend === "webgpu" && runtimeRef.current !== newRuntime) {
          const oldRuntime = runtimeRef.current;
          runtimeRef.current = newRuntime;
          setBackend(newBackend);
          for (const layerId of layerCanvasesRef.current.keys()) {
            newRuntime.invalidateLayer(layerId);
          }
          void oldRuntime;
          requestAnimationFrame(() => {
            if (!cancelled) {
              requestRedrawRef.current();
            }
          });
        } else {
          void newRuntime;
          requestRedrawRef.current();
        }
      }
    );

    return () => {
      cancelled = true;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { runtimeRef, runtime, backend, bootstrapPhaseActive };
}
