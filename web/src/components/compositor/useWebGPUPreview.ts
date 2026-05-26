/**
 * useWebGPUPreview — live, GPU-resident preview of the compositor stack.
 *
 * Drives the same {@link WebGPULayerCompositor} the node uses server-side, so
 * the in-editor preview is pixel-faithful to the rendered output. Each layer's
 * source bitmap is uploaded to a cached texture; every render clears the
 * accumulation, blends the visible layers in order with their transforms, and
 * blits to the canvas (premultiplied-alpha, matching the shader output).
 *
 * The host owns the canvas; this hook owns the device, the compositor, and the
 * per-layer texture cache. WebGPU is required — there is no CPU fallback;
 * `status` reports `unavailable` so the host can surface a message.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WebGPULayerCompositor,
  defaultLayerTransform,
  layerTransformToInverseAffine,
  type LayerTransform2D
} from "@nodetool-ai/gpu/webgpu";

export interface PreviewLayer {
  /** Stable identity (the `image_N` key). */
  id: string;
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
  opacity: number;
  blendModeId: number;
  visible: boolean;
  transform?: LayerTransform2D;
}

export type PreviewStatus = "pending" | "ready" | "unavailable";

const PREVIEW_FORMAT: GPUTextureFormat = "rgba8unorm";

let sharedDevicePromise: Promise<GPUDevice | null> | null = null;

async function acquireDevice(): Promise<GPUDevice | null> {
  if (!sharedDevicePromise) {
    sharedDevicePromise = (async () => {
      const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
      if (!gpu) return null;
      try {
        const adapter = await gpu.requestAdapter();
        if (!adapter) return null;
        return await adapter.requestDevice();
      } catch {
        return null;
      }
    })().catch(() => {
      sharedDevicePromise = null;
      return null;
    });
  }
  return sharedDevicePromise;
}

interface CachedTexture {
  texture: GPUTexture;
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
}

export interface UseWebGPUPreviewResult {
  status: PreviewStatus;
  /** Imperative render trigger (also runs automatically on input changes). */
  render: () => void;
}

export function useWebGPUPreview(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  canvasWidth: number,
  canvasHeight: number,
  layers: PreviewLayer[]
): UseWebGPUPreviewResult {
  const [status, setStatus] = useState<PreviewStatus>("pending");
  const deviceRef = useRef<GPUDevice | null>(null);
  const compositorRef = useRef<WebGPULayerCompositor | null>(null);
  const contextRef = useRef<GPUCanvasContext | null>(null);
  const configuredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const texturesRef = useRef<Map<string, CachedTexture>>(new Map());

  // Keep the latest inputs in refs so `render` is stable across renders.
  const latest = useRef({ canvasWidth, canvasHeight, layers });
  latest.current = { canvasWidth, canvasHeight, layers };

  useEffect(() => {
    let cancelled = false;
    acquireDevice().then((device) => {
      if (cancelled) return;
      if (!device) {
        setStatus("unavailable");
        return;
      }
      deviceRef.current = device;
      compositorRef.current = new WebGPULayerCompositor(
        device,
        PREVIEW_FORMAT,
        "linear"
      );
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const getOrUploadTexture = useCallback(
    (device: GPUDevice, layer: PreviewLayer): GPUTexture | null => {
      if (!layer.bitmap) return null;
      const cache = texturesRef.current;
      const existing = cache.get(layer.id);
      if (existing && existing.bitmap === layer.bitmap) {
        return existing.texture;
      }
      existing?.texture.destroy();
      const texture = device.createTexture({
        label: `compositor-preview-${layer.id}`,
        size: { width: layer.width, height: layer.height },
        format: PREVIEW_FORMAT,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
      device.queue.copyExternalImageToTexture(
        { source: layer.bitmap },
        { texture },
        { width: layer.width, height: layer.height }
      );
      cache.set(layer.id, {
        texture,
        bitmap: layer.bitmap,
        width: layer.width,
        height: layer.height
      });
      return texture;
    },
    []
  );

  const render = useCallback(() => {
    const device = deviceRef.current;
    const compositor = compositorRef.current;
    const canvas = canvasRef.current;
    if (!device || !compositor || !canvas) return;

    const { canvasWidth: w, canvasHeight: h, layers: ls } = latest.current;
    const width = Math.max(1, Math.floor(w));
    const height = Math.max(1, Math.floor(h));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    if (configuredCanvasRef.current !== canvas || !contextRef.current) {
      const ctx = canvas.getContext("webgpu");
      if (!ctx) return;
      ctx.configure({
        device,
        format: PREVIEW_FORMAT,
        alphaMode: "premultiplied"
      });
      contextRef.current = ctx;
      configuredCanvasRef.current = canvas;
    }
    const context = contextRef.current;
    if (!context) return;

    compositor.ensureSize(width, height);
    const texA = compositor.textureA;
    const texB = compositor.textureB;
    if (!texA || !texB) return;

    const encoder = device.createCommandEncoder({
      label: "compositor-preview"
    });
    // Seed the read texture transparent.
    encoder
      .beginRenderPass({
        colorAttachments: [
          {
            view: texA.createView(),
            loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            storeOp: "store"
          }
        ]
      })
      .end();

    compositor.beginFrame();
    let read = texA;
    let write = texB;
    for (const layer of ls) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const source = getOrUploadTexture(device, layer);
      if (!source) continue;
      const transform =
        layer.transform ??
        defaultLayerTransform(layer.width, layer.height, width, height);
      compositor.renderBlendPass(encoder, read, write, {
        source,
        opacity: layer.opacity,
        blendModeId: layer.blendModeId,
        canvasW: width,
        canvasH: height,
        invAffine: layerTransformToInverseAffine(
          transform,
          layer.width,
          layer.height
        )
      });
      const next = read;
      read = write;
      write = next;
    }

    compositor.blit(encoder, read, context.getCurrentTexture().createView());
    device.queue.submit([encoder.finish()]);
  }, [canvasRef, getOrUploadTexture]);

  // Re-render whenever the inputs or readiness change.
  useEffect(() => {
    if (status === "ready") render();
  }, [status, canvasWidth, canvasHeight, layers, render]);

  // Drop textures for layers that no longer exist.
  useEffect(() => {
    const ids = new Set(layers.map((l) => l.id));
    const cache = texturesRef.current;
    for (const [id, cached] of cache) {
      if (!ids.has(id)) {
        cached.texture.destroy();
        cache.delete(id);
      }
    }
  }, [layers]);

  useEffect(() => {
    return () => {
      for (const cached of texturesRef.current.values()) {
        cached.texture.destroy();
      }
      texturesRef.current.clear();
      compositorRef.current?.dispose();
      compositorRef.current = null;
    };
  }, []);

  return { status, render };
}
