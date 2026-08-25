/**
 * @nodetool-ai/gpu — Public API (pure root).
 *
 * The blend-mode catalog + shared WGSL blend functions (Phase 0), consumed by
 * the sketch editor, the timeline preview, and the Compositor node. The mode
 * names come from `@nodetool-ai/protocol/blend-modes` and are re-exported
 * here; this package owns the WGSL/Canvas2D/libvips mappings on top of them.
 * This entry is pure — no WebGPU runtime, no TypeGPU import — so Node-side
 * consumers (base-nodes) can pull in the catalog without dragging in the GPU
 * stack.
 *
 * The TypeGPU-backed shader pool (Phase 1) lives behind `./pool`; the
 * browser-only layer-compositing engine behind `./webgpu`.
 */

export * from "./blend/index.js";
