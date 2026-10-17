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
 * per-layer texture cache. Without a WebGPU adapter the same stack is drawn
 * with Canvas2D (`globalCompositeOperation` per blend mode) and `status`
 * reports `fallback`, so the layers stay visible in every browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BLEND_MODE_INFOS } from "@nodetool-ai/gpu";
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

export type PreviewStatus = "pending" | "ready" | "fallback";

const PREVIEW_FORMAT: GPUTextureFormat = "rgba8unorm";

const CANVAS_OP_BY_GPU_ID = new Map<number, GlobalCompositeOperation>(
  BLEND_MODE_INFOS.map((info) => [
    info.gpuId,
    info.canvasOp as GlobalCompositeOperation
  ])
);

const canvasOpForGpuId = (id: number): GlobalCompositeOperation =>
  CANVAS_OP_BY_GPU_ID.get(id) ?? "source-over";

let sharedDevicePromise: Promise<GPUDevice | null> | null = null;

async function acquireDevice(): Promise<GPUDevice | null> {
  if (!sharedDevicePromise) {
    sharedDevicePromise = (async () => {
      const gpu = navigator.gpu;
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

/**
 * Upload a decoded bitmap into `texture`. `copyExternalImageToTexture` can
 * refuse a bitmap ("Failed to copy content from external image") — seen with
 * Chromium's software adapter — so fall back to reading the pixels through a
 * 2D canvas and `writeTexture`. Both paths upload straight (unpremultiplied)
 * alpha. Returns false when neither path could read the bitmap.
 */
function uploadBitmap(
  device: GPUDevice,
  bitmap: ImageBitmap,
  texture: GPUTexture
): boolean {
  const { width, height } = bitmap;
  try {
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      { width, height }
    );
    return true;
  } catch {
    // Fall through to the CPU readback below.
  }
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    device.queue.writeTexture(
      { texture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );
    return true;
  } catch {
    return false;
  }
}

interface CachedTexture {
  texture: GPUTexture;
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
}

interface UseWebGPUPreviewResult {
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
        setStatus("fallback");
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
      if (!uploadBitmap(device, layer.bitmap, texture)) {
        texture.destroy();
        return null;
      }
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

  const render2d = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { canvasWidth: w, canvasHeight: h, layers: ls } = latest.current;
    const width = Math.max(1, Math.floor(w));
    const height = Math.max(1, Math.floor(h));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, width, height);
    for (const layer of ls) {
      if (!layer.visible || layer.opacity <= 0 || !layer.bitmap) continue;
      const t =
        layer.transform ??
        defaultLayerTransform(layer.width, layer.height, width, height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = canvasOpForGpuId(layer.blendModeId);
      // Same forward map as `layerTransformToInverseAffine`:
      // canvas = R·S·(texel − center) + (x, y).
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rotation);
      ctx.scale(t.scaleX, t.scaleY);
      ctx.drawImage(layer.bitmap, -layer.width / 2, -layer.height / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, [canvasRef]);

  const render = useCallback(() => {
    if (status === "fallback") {
      render2d();
      return;
    }
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
  }, [canvasRef, getOrUploadTexture, status, render2d]);

  // Re-render whenever the inputs or readiness change.
  useEffect(() => {
    if (status !== "pending") render();
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
