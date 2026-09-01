/**
 * @nodetool-ai/timeline/scene — the render surface minus the GPU.
 *
 * `./render` re-exports {@link HeadlessFrameCompositor}, which imports
 * `@nodetool-ai/gpu/webgpu` and through it TypeGPU. A caller that only needs to
 * resolve what is on screen at a time and draw it on a Canvas 2D surface — the
 * agent-facing frame preview — should not pay for that, so the GPU-free half is
 * re-exported here: the scene model, the placement math, the text/shape/caption
 * drawing rules and the Canvas 2D compositing rules.
 *
 * Import `./render` when you want the GPU compositor, `./scene` when you don't.
 * Both draw from the same modules, so the two paths cannot drift.
 */

export * from "./render/sceneModel.js";
export * from "./render/transform.js";
export * from "./render/draw.js";
export * from "./render/canvas2d.js";
