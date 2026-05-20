/**
 * Blend catalog — pure, Node-safe.
 *
 * The canonical `BlendMode` union, the ordered UI list, stable `gpuId`s, the
 * Canvas2D / Sharp-libvips mappings, and the shared WGSL `applyBlendMode`
 * switch. No WebGPU runtime — importable from Node consumers.
 */

export * from "./blendModes.js";
export * from "./wgsl.js";
