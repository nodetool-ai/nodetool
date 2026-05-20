/**
 * @nodetool-ai/gpu — Public API (pure root).
 *
 * The canonical blend-mode catalog + shared WGSL blend functions (Phase 0),
 * consumed by the sketch editor, the timeline preview, the Compositor node,
 * and `@nodetool-ai/protocol`'s timeline schema. This entry is pure — no
 * WebGPU runtime, no TypeGPU import — so Node-side consumers (base-nodes) can
 * pull in the catalog without dragging in the GPU stack.
 *
 * The TypeGPU-backed shader pool (Phase 1) lives behind `./pool`; the
 * browser-only layer-compositing engine behind `./webgpu`.
 */

export * from "./blend/index.js";
