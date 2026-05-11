---
id: T-20260511-0006
title: "Scaffold shared GPU library at web/src/lib/gpu/"
state: todo
plan: P-2026-05-11-shared-wgsl-shaders
assignee: ""
dependencies: []
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
estimate: 4h
tags: [webgpu, wgsl, shared-lib]
---

# Description

Create `web/src/lib/gpu/` as the canonical home for all WebGPU initialization,
helper utilities, and WGSL shader primitives shared across the image editor,
timeline preview, and sketch editor.

The library is designed for a growing node-based effects pipeline (ArcBrush /
Substance Designer model): every operation is a GPU node with texture-in /
texture-out. New node types are added by dropping a new shader file into
`shaders/` — no changes to core infrastructure needed.

Architecture rules:
- **One file per operation** in `shaders/`. No monolithic effects shader.
- **Compute-first**: per-pixel ops use compute passes, not fragment shaders.
- **common.wgsl.ts** only contains primitives used by ≥2 other shaders.
- **No React, no Zustand, no DOM** — pure GPU infrastructure.

## Directory layout

```
web/src/lib/gpu/
  index.ts               # re-exports everything
  init.ts                # device/adapter creation, context setup
  helpers.ts             # pipeline boilerplate, texture pool, readback
  types.ts               # shared TypeScript interfaces and enums
  pipeline.ts            # GPUNodePipeline — the texture-in/out runner
  shaders/
    common.wgsl.ts       # shared WGSL primitives (vertex, sampling, blend math)
    composite.wgsl.ts    # layer compositing (fragment)
    blit.wgsl.ts         # blit to swap chain (fragment)
    colorGrading.wgsl.ts # brightness/contrast/saturation/hue/temp/tint/shadows/highlights
    blur.wgsl.ts         # separable Gaussian (2-pass compute)
```

Future shaders added here without touching anything above:
`curves.wgsl.ts`, `levels.wgsl.ts`, `warp.wgsl.ts`, `noise.wgsl.ts`, etc.

## File specifications

### `init.ts`

```ts
isWebGPUAvailable(): boolean
initWebGPU(opts?: { powerPreference?: GPUPowerPreference }): Promise<{ adapter, device }>
createGPUContext(canvas: HTMLCanvasElement, device: GPUDevice): GPUCanvasContext
```

### `types.ts`

**`BlendMode` enum** — 18 modes (superset of sketch 12 + timeline 5 + ArcBrush 18):
normal, multiply, screen, overlay, softLight, hardLight, colorDodge, colorBurn,
difference, exclusion, darken, lighten, hue, saturation, color, luminosity, add, subtract

**`ColorGrading` interface**:
`brightness`, `contrast`, `saturation`, `hue`, `temperature`, `tint`,
`shadows`, `highlights` — all `number`, all default 0 (neutral)

**`BlurParams` interface**: `radius: number`, `sigma?: number`

**`GPUNodeResult`**: `{ texture: GPUTexture; width: number; height: number }`

**`GPUNodeInput`**: `GPUNodeResult | ImageBitmap | HTMLCanvasElement | HTMLVideoElement`

### `helpers.ts`

```ts
// Fullscreen render pass boilerplate
createFullscreenPass(device, shaderCode, bindings, label?): GPURenderPipeline

// Compute pass boilerplate
createComputePass(device, shaderCode, bindings, label?): GPUComputePipeline

// Texture pool — acquire/release by [width, height, format]
createTexturePool(device): TexturePool
interface TexturePool {
  acquire(w: number, h: number, format?: GPUTextureFormat): GPUTexture
  release(texture: GPUTexture): void
  destroy(): void
}

// Upload any image source to a GPU texture
uploadToTexture(device: GPUDevice, source: GPUNodeInput): GPUTexture

// Read GPU texture back to CPU
readbackTexture(device: GPUDevice, texture: GPUTexture): Promise<ImageData>
```

### `pipeline.ts`

`GPUNodePipeline` — the core runner for texture-in / texture-out operations:

```ts
class GPUNodePipeline {
  constructor(device: GPUDevice, pool: TexturePool)

  // Run a single compute pass shader over an input texture, return result texture
  runCompute(
    shader: string,           // WGSL source (includes common.wgsl.ts as prefix)
    input: GPUTexture,
    uniforms?: ArrayBuffer,
    label?: string,
  ): GPUNodeResult

  // Run two-pass operation (e.g. separable blur H + V)
  runTwoPass(
    shaderH: string,
    shaderV: string,
    input: GPUTexture,
    uniforms?: ArrayBuffer,
  ): GPUNodeResult

  destroy(): void
}
```

This is the primitive that every effect node (color grading, blur, curves,
warp, noise) will use. Future node types call `pipeline.runCompute()` with
their own shader string — no new infrastructure needed.

### `shaders/common.wgsl.ts`

`COMMON_WGSL` — string prefix prepended to every shader:
- `fn fullscreen_quad_vertex(vertex_index: u32) -> vec4f`
- `fn sample_layer(tex, smp, uv, inv_affine: mat3x2f) -> vec4f`
- `fn blend(src: vec3f, dst: vec3f, mode: u32) -> vec3f` — dispatches to all 18 modes
- All 18 blend mode functions (port 12 from sketch; add hue/sat/color/lum/add/subtract)
- `fn srgb_to_linear(c: vec3f) -> vec3f` / `fn linear_to_srgb(c: vec3f) -> vec3f`
- `fn rgb_to_hsl(c: vec3f) -> vec3f` / `fn hsl_to_rgb(h: f32, s: f32, l: f32) -> vec3f`
- `fn rgb_to_hsv(c: vec3f) -> vec3f` / `fn hsv_to_rgb(h: f32, s: f32, v: f32) -> vec3f`
  (color space math required by hue/sat/lum blend modes and color grading)

### `shaders/colorGrading.wgsl.ts`

`COLOR_GRADING_WGSL` — compute shader (`@workgroup_size(8, 8)`):
- Uniform struct: `ColorGradingUniforms` (8 f32 fields)
- `fn apply_brightness_contrast(c, brightness, contrast) -> vec3f`
- `fn apply_saturation(c, amount) -> vec3f` (works in HSL)
- `fn apply_hue_shift(c, degrees) -> vec3f`
- `fn apply_temperature_tint(c, temp, tint) -> vec3f` (shifts in LAB-approximation)
- `fn apply_shadows_highlights(c, shadows, highlights) -> vec3f`
- Main entry: chain all ops in photographic order

Port color math from `timeline/preview/gpu/effectsProcessor.ts`.

### `shaders/blur.wgsl.ts`

`BLUR_H_WGSL`, `BLUR_V_WGSL` — two compute shaders for separable Gaussian:
- Workgroup size `@workgroup_size(256, 1)` (H) and `@workgroup_size(1, 256)` (V)
- Kernel weights computed from radius uniform at runtime (no precomputed table)
- Port from `timeline/preview/gpu/effectsProcessor.ts`

### `shaders/composite.wgsl.ts`

`COMPOSITE_WGSL` — fragment shader for layer blending:
- Reads layer texture + accumulator texture
- Applies opacity, blend mode (via `blend()` from `COMMON_WGSL`), affine transform
- Used by timeline compositor and image editor overlay compositing
- Port from `timeline/preview/gpu/shaders.ts`

### `shaders/blit.wgsl.ts`

`BLIT_WGSL` — trivial fullscreen copy to swap chain.
Identical in sketch and timeline today; extracted here.

### `index.ts`

Re-export all public symbols. Consumers:
```ts
import { initWebGPU, GPUNodePipeline, BlendMode, COLOR_GRADING_WGSL } from "@/lib/gpu"
```

# Acceptance criteria

- [ ] `web/src/lib/gpu/` exists with all files above
- [ ] `BlendMode` enum has all 18 modes
- [ ] `COMMON_WGSL` includes all 18 blend mode functions, both color space
  round-trips (sRGB↔linear, RGB↔HSL, RGB↔HSV)
- [ ] `GPUNodePipeline.runCompute()` and `runTwoPass()` are implemented and
  type-correct (can be exercised by T-0009 without modification)
- [ ] `createTexturePool` acquire/release cycle tested (Vitest, mock device)
- [ ] `uploadToTexture` handles `ImageBitmap`, `HTMLCanvasElement`,
  `HTMLVideoElement` as inputs
- [ ] `npm run typecheck` passes (web workspace)
- [ ] `npm run lint` passes

# Notes
## 2026-05-11 — rkt
Long-term direction: full node-based image editor (ArcBrush / Substance model).
Every future effect node (curves, levels, warp, noise, mask, channel ops) will
call `GPUNodePipeline.runCompute()` with its own shader. The library must not
require changes to `pipeline.ts` or `helpers.ts` to add new node types.

Blend mode inventory:
- From sketch (12): normal, multiply, screen, overlay, softLight, hardLight,
  colorDodge, colorBurn, difference, exclusion, darken, lighten
- Additional for ArcBrush parity (6): hue, saturation, color, luminosity, add, subtract
- Total: 18

Color space math (sRGB↔linear, RGB↔HSL, RGB↔HSV) goes in `common.wgsl.ts`
because it's needed by blend modes AND color grading — don't duplicate it.

WGSL shader strings exported as TypeScript template literals (no `.wgsl` files,
no bundler changes, works with current Vite setup).

Internal working texture format must be `rgba8unorm`, not `bgra8unorm`.
Some platforms (macOS Metal) prefer `bgra8unorm` for the swap chain, but
working textures used in compute passes and readback must be `rgba8unorm` so
that raw frame bytes are in the correct channel order when piped to FFmpeg
or WebCodecs. Use `bgra8unorm` only on the final blit-to-swap-chain pass.
Check `adapter.features` — if `"bgra8unorm-storage"` is available, the blit
can read a bgra swap chain texture directly; otherwise keep working textures
rgba and convert at blit time.
