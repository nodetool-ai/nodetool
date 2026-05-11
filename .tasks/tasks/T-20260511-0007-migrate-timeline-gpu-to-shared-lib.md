---
id: T-20260511-0007
title: "Migrate timeline GPU shaders to shared library"
state: todo
plan: P-2026-05-11-shared-wgsl-shaders
assignee: ""
dependencies: [T-20260511-0006]
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
estimate: 3h
tags: [webgpu, wgsl, timeline]
---

# Description

Replace the duplicated WGSL in the timeline GPU stack with imports from the
shared library created in T-0006. Behavior must be identical — this is a
pure refactor, no visual changes.

## Files to change

**`web/src/components/timeline/preview/gpu/shaders.ts`**

Currently defines `compositeShader` and `blitShader` as inline WGSL strings.
Replace with imports from `@/lib/gpu/shaders/composite.wgsl` and
`@/lib/gpu/shaders/blit.wgsl`.

The 5 existing blend mode constants map to the shared `BlendMode` enum:
- `BLEND_NORMAL` → `BlendMode.Normal`
- `BLEND_ADD` — not in the 12-mode enum; keep as a local constant and pass
  the raw integer, or add `Add` to the shared enum (preferred)
- `BLEND_MULTIPLY` → `BlendMode.Multiply`
- `BLEND_SCREEN` → `BlendMode.Screen`
- `BLEND_OVERLAY` → `BlendMode.Overlay`

Decision: add `Add` to the shared enum in T-0006 (update T-0006 task if needed,
or handle it here and note the discrepancy).

**`web/src/components/timeline/preview/gpu/effectsProcessor.ts`**

`WebGPUEffectsProcessor` currently inlines compute shader WGSL and manages
its own texture pool. Replace:
- Inline shader → `EFFECTS_WGSL` from `@/lib/gpu/shaders/effects.wgsl`
- Internal texture pool → `createTexturePool()` from `@/lib/gpu/helpers`
- `ColorGrading` type → import from `@/lib/gpu/types`

**`web/src/components/timeline/preview/gpu/compositor.ts`**

`WebGPUCompositor` uses `initWebGPU` logic inline. Replace with:
- `initWebGPU()` from `@/lib/gpu/init`
- `uploadImageToTexture()` from `@/lib/gpu/helpers`
- `createFullscreenPass()` from `@/lib/gpu/helpers`

# Acceptance criteria

- [ ] `timeline/preview/gpu/shaders.ts` no longer contains inline WGSL strings;
  all shader source comes from `@/lib/gpu/shaders/`
- [ ] `timeline/preview/gpu/effectsProcessor.ts` uses `EFFECTS_WGSL` and
  `createTexturePool` from shared lib
- [ ] `timeline/preview/gpu/compositor.ts` uses `initWebGPU` and
  `createFullscreenPass` from shared lib
- [ ] Timeline preview renders identically to before (manual smoke test:
  play a video clip with color grading, verify no visual regression)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

# Notes
## 2026-05-11 — rkt
Pure refactor — no new GPU features for timeline in this task.

If `BlendMode.Add` is needed, update T-0006 before merging this.
Timeline effect parameters flow in via `EffectsParams`; make sure the
shared type covers `blur` (radius) and all 8 color grading fields.
