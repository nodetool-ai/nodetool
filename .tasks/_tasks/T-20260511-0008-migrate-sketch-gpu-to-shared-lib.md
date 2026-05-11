---
id: T-20260511-0008
title: "Migrate sketch GPU shaders to shared library"
state: todo
plan: P-2026-05-11-shared-wgsl-shaders
assignee: ""
dependencies: [T-20260511-0006]
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
estimate: 3h
tags: [webgpu, wgsl, sketch]
---

# Description

Replace the duplicated WGSL in the sketch rendering stack with imports from
the shared library created in T-0006. Behavior must be identical — pure refactor.

The sketch shader file (`shaders.ts`) is ~400 lines and is the source of truth
for the 12 blend modes that the shared library will adopt. Migration here is
about removing the now-redundant definitions, not rewriting logic.

## Files to change

**`web/src/components/sketch/rendering/shaders.ts`**

Currently defines all WGSL as exported string constants. After T-0006:
- `FULLSCREEN_QUAD_VERTEX` → remove; use the vertex entry from `COMMON_WGSL`
  (or re-export from shared lib if consumers import it by name)
- `SAMPLE_LAYER_WGSL` — the `fn sample_layer(...)` helper → move to `COMMON_WGSL`
- `BLEND_COMPOSITE_FRAGMENT` — 12 blend mode dispatch → body moves to
  `COMMON_WGSL`; keep a thin wrapper here that builds the full shader string
  by concatenating `COMMON_WGSL + BLEND_COMPOSITE_FRAGMENT_BODY`
- `BLIT_FRAGMENT` → import `BLIT_WGSL` from `@/lib/gpu/shaders/blit.wgsl`
- `CHECKERBOARD_FRAGMENT` — sketch-specific, stays local (not shared)
- `LAYER_COMPOSITE_FRAGMENT` — sketch-specific (uses sketch's uniform layout),
  stays local but can call `fn sample_layer` from `COMMON_WGSL`
- `SELECTION_ANTS_FRAGMENT` — sketch-specific, stays local
- `BORDER_FRAGMENT` — sketch-specific, stays local

**`web/src/components/sketch/rendering/gpuHelpers.ts`**

`createFullscreenPass()` here is identical to the shared version. Replace:
```ts
// Before
export function createFullscreenPass(...) { ... }

// After
export { createFullscreenPass } from "@/lib/gpu/helpers";
```

File can become a thin re-export or be deleted if no other sketch code imports
it directly (check import graph first).

**`web/src/components/sketch/rendering/initWebGPU.ts`**

`isWebGPUAvailable()` and `initWebGPU()` — identical to what T-0006 puts in
`@/lib/gpu/init`. Replace with re-exports:
```ts
export { isWebGPUAvailable, initWebGPU } from "@/lib/gpu/init";
```
Keep the file to avoid changing all downstream imports, or update
`WebGPURuntime.ts` and `Canvas2DRuntime.ts` to import from `@/lib/gpu/init`
directly (simpler long-term).

**`web/src/components/sketch/rendering/WebGPURuntime.ts`**

- Import `initWebGPU`, `isWebGPUAvailable` from `@/lib/gpu/init`
- Import `createFullscreenPass` from `@/lib/gpu/helpers`
- Keep all sketch-specific pipeline setup (layer textures, selection ants,
  border, ping-pong) unchanged

# Acceptance criteria

- [ ] `sketch/rendering/shaders.ts` no longer duplicates blend mode functions
  already in `COMMON_WGSL`
- [ ] `sketch/rendering/gpuHelpers.ts` `createFullscreenPass` comes from
  `@/lib/gpu/helpers` (no duplicate implementation)
- [ ] `sketch/rendering/initWebGPU.ts` delegates to `@/lib/gpu/init`
- [ ] Sketch editor renders identically (manual smoke test: paint strokes with
  multiply and screen blend modes; verify marching ants on selection)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

# Notes
## 2026-05-11 — rkt
Sketch-specific shaders that do NOT move to shared lib:
- `CHECKERBOARD_FRAGMENT` — transparent background indicator, not needed elsewhere
- `SELECTION_ANTS_FRAGMENT` — selection UI, sketch-only concept
- `BORDER_FRAGMENT` — canvas outline, sketch-only

The composite fragment shader in sketch has a different uniform layout than
timeline's (sketch uses per-pixel affine inverse, timeline uses a different
transform encoding). They stay separate; only the blend mode *functions* and
the sampling *helper* are genuinely shared.
