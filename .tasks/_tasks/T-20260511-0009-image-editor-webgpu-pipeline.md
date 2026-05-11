---
id: T-20260511-0009
title: "Add WebGPU pipeline to image editor (Canvas2D deprecated)"
state: todo
plan: P-2026-05-11-shared-wgsl-shaders
assignee: ""
dependencies: [T-20260511-0006]
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
estimate: 5h
tags: [webgpu, wgsl, image-editor]
---

# Description

The Canvas2D image editor is being deprecated. Build a new WebGPU-native image
editor rendering pipeline using the shared GPU library from T-0006. No Canvas2D
fallback — WebGPU is the only target.

The image editor adjustments (brightness, contrast, saturation, hue,
temperature, tint, blur) will run as GPU compute passes using the shared
`EFFECTS_WGSL` shader. The display canvas uses a WebGPU context.

## New files to create

**`web/src/components/node/image_editor/gpu/ImageEditorGPU.ts`**

```ts
class ImageEditorGPU {
  private device: GPUDevice;
  private context: GPUCanvasContext;

  static async create(canvas: HTMLCanvasElement): Promise<ImageEditorGPU>;

  // Upload source image, run effects compute pass, present to canvas
  async render(
    source: ImageBitmap | HTMLCanvasElement,
    params: EffectsParams,   // from @/lib/gpu/types
  ): Promise<void>;

  // Read pixels back for export / saving
  async readback(): Promise<ImageData>;

  destroy(): void;
}
```

- `initWebGPU()` from `@/lib/gpu/init`
- `createGPUContext()` from `@/lib/gpu/init` on the editor canvas
- `EFFECTS_WGSL` compute shader: color grading (1 pass) + separable Gaussian blur (2 passes)
- Result stays on GPU between renders; only `readback()` pulls it to CPU
- Texture for the working image is re-uploaded when the source changes,
  reused across adjustment slider changes

## Files to change

**`web/src/components/node/image_editor/ImageEditorCanvas.tsx`**

- Replace `getContext("2d")` on the main canvas with WebGPU context via `ImageEditorGPU.create()`
- Store `ImageEditorGPU` instance in a ref; destroy on unmount
- On every render: call `gpu.render(source, adjustmentParams)` instead of
  the Canvas2D adjustment pipeline
- Drawing layer (brush strokes) composited on top via a second GPU pass or
  uploaded as an overlay texture — keep it simple for now: render drawing
  canvas as an overlay layer using `COMPOSITE_WGSL` from the shared lib
- Remove the temp-canvas adjustment logic; remove Canvas2D fallback branches

**`web/src/components/node/image_editor/canvasUtils.ts`**

Remove the adjustment functions (brightness, contrast, saturation, hue,
temperature, tint, blur) that are now handled by the GPU. Keep only utilities
that are unrelated to adjustments (e.g. flood fill, shape drawing helpers used
by the drawing canvas, which remains Canvas2D).

## Parameter mapping

`AdjustmentSettings` (in `types.ts`) → `ColorGrading` from `@/lib/gpu/types`:

| AdjustmentSettings | ColorGrading    |
|--------------------|-----------------|
| `brightness`       | `brightness`    |
| `contrast`         | `contrast`      |
| `saturation`       | `saturation`    |
| `hue`              | `hue`           |
| `temperature`      | `temperature`   |
| `tint`             | `tint`          |
| `shadows`          | `shadows`       |
| `highlights`       | `highlights`    |
| `blur`             | `blur`          |

Verify names match; update `ColorGrading` in T-0006 if any field is missing.

# Acceptance criteria

- [ ] `image_editor/gpu/ImageEditorGPU.ts` exists; all adjustments run on GPU
- [ ] Main editor canvas is a WebGPU canvas (no `getContext("2d")` on it)
- [ ] Drawing layer (brush strokes) composites correctly over the adjusted image
- [ ] `readback()` returns correct pixel data used for save/export
- [ ] No memory leak: working texture reused across slider changes; destroyed on unmount
- [ ] Canvas2D adjustment code removed from `canvasUtils.ts`
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

# Notes
## 2026-05-11 — rkt
Canvas2D image editor is deprecated — no fallback needed. WebGPU only.

The drawing canvas (brush strokes, shapes, text) stays Canvas2D — it's authored
by the user's pointer events and uploaded to GPU as an overlay texture when
compositing. Don't try to port brush rendering to GPU in this task.

Result stays on GPU between renders (only re-upload source when image changes,
rerun compute on every slider change). Export/save calls `readback()` once.
