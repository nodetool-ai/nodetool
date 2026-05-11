---
id: P-2026-05-11-shared-wgsl-shaders
title: "Shared WGSL Shaders for Image Editor and Timeline"
state: accepted
owner: rkt
created: 2026-05-11
updated: 2026-05-11
tags: [webgpu, rendering, image-editor, timeline, sketch]
---

# Goal

Consolidate duplicated WGSL shader code from the sketch editor and timeline
preview into a single shared GPU library at `web/src/lib/gpu/`, then bring
WebGPU acceleration to the image editor using that library as a foundation
for a full node-based effects pipeline.

# Long-term vision

The image editor is moving toward a node-based, non-destructive GPU pipeline
modeled on tools like ArcBrush, Substance Designer, and Nuke — where every
operation (color grade, blur, warp, mask, blend, noise, export) is a node
that can be wired into a graph and re-evaluated incrementally.

The shared GPU library must be architected to support this from the start:

- **One shader file per operation** (`shaders/blur.wgsl.ts`,
  `shaders/colorGrading.wgsl.ts`, `shaders/composite.wgsl.ts`, etc.) rather
  than a monolithic effects shader. Each "node type" owns its shader.
- **Common primitives** (`shaders/common.wgsl.ts`) shared by all: fullscreen
  quad, affine sampling, blend mode functions, color space math.
- **Compute-first design**: every per-pixel operation is a compute pass, not
  a fragment pass, so workgroup size and dispatch can be tuned independently
  per operation.
- **Texture-in / texture-out**: every GPU node reads from one or more input
  textures and writes to an output texture. Composition is explicit, not
  implicit. This maps directly to the node graph model.
- **Multi-pass composable**: operations chain by connecting texture outputs to
  texture inputs. The pipeline can be any DAG, not a fixed sequence.

Near-term scope (this plan's tasks) covers the foundation and the current
adjustment set. Subsequent plans will add node categories incrementally:
warp/distortion, masking, procedural generation, channel ops, advanced color.

# Problem

Two full WebGPU implementations exist today with significant duplication:

- `web/src/components/sketch/rendering/shaders.ts` — 400+ lines WGSL
  (12 blend modes, fullscreen quad, checkerboard, affine sampling, marching ants)
- `web/src/components/timeline/preview/gpu/shaders.ts` + `effectsProcessor.ts`
  — composite/blit shaders + inline compute shaders for color grading and blur
  (5 blend modes, ping-pong textures, effects pipeline)

Shared primitives duplicated between them: fullscreen-quad vertex shader,
layer-sampling helper, blend mode functions, color grading math, blur kernel,
WebGPU init utilities, and `createFullscreenPass()` boilerplate.

The image editor (`web/src/components/node/image_editor/`) has no GPU
acceleration — all adjustments run on the CPU via Canvas2D (deprecated).

# Approach

1. **Scaffold shared library** at `web/src/lib/gpu/` — extensible structure
   designed for a growing set of per-operation shaders (see T-0006)

2. **Migrate timeline GPU** to use the shared library (no behavior change)

3. **Migrate sketch GPU** to use the shared library (no behavior change)

4. **Add WebGPU to image editor** — GPU-native rendering pipeline using the
   shared library. Canvas2D path deprecated and removed.

Tasks 2 and 3 can proceed in parallel once Task 1 is done. Task 4 depends only
on Task 1.

# Export pipeline design note

The WGSL shaders run in the browser (WebGPU). FFmpeg is a native/server
process. They cannot share GPU memory. For video export, frames must cross
that boundary. Two viable strategies:

**Readback → FFmpeg pipe** (prototype path):
`renderFrame()` → `readbackTexture()` → raw RGBA bytes → Electron IPC →
FFmpeg stdin. ~8 MB/frame at 1080p. Feasible for short clips and prototyping;
may struggle at high res or long duration due to IPC throughput and readback
cost.

**WebCodecs → FFmpeg mux** (production path):
GPU renders frame → `VideoEncoder` (WebCodecs API, hardware-accelerated in
Electron renderer) → encoded packets → IPC → FFmpeg mux-only pass. FFmpeg
handles container format and codec presets; the browser handles encode.
Best quality/speed, more wiring.

Both strategies work with the WGSL shaders in this plan unchanged — the
difference is purely what happens after `renderFrame()`. The export task
(future plan) chooses the strategy. Start with readback for correctness,
migrate to WebCodecs when throughput becomes a bottleneck.

Real-time preview is unaffected — the timeline compositor already runs
WebGPU effects at playback frame rate.

# Out of scope (this plan)

- Canvas2D fallback for the image editor (Canvas2D path is deprecated)
- Mobile WebGPU support (not available in React Native/Expo)
- HDR output or wide-gamut color spaces
- Video decode acceleration
- Sketch-specific shaders (marching ants, checkerboard, canvas border)
- New effect node types beyond current adjustment set (future plans)
- Node graph UI for the image editor (future plan)
- Warp/distortion, masking, procedural noise, channel ops (future plans)
- Video export pipeline (future plan — readback or WebCodecs strategy TBD)
