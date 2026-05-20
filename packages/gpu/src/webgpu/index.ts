/**
 * @nodetool-ai/gpu/webgpu – Shared WebGPU compositing engine.
 *
 * Browser/WebGPU-only. Kept in a separate entry point so the pure
 * blend-mode catalog (the package root) stays importable by Node-side
 * consumers without pulling in WebGPU types.
 */

export * from "./compositor.js";
export * from "./shaders.js";
