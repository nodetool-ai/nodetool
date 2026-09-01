/**
 * @nodetool-ai/timeline – animation (motion-design) public API.
 *
 * Pure engine: preset → curve compiler and sampler, plus the custom-animation
 * (baked JS curves) contract. No DOM, GPU, or store.
 */

export * from "./types.js";
export * from "./easing.js";
export * from "./presets.js";
export * from "./custom.js";
export * from "./compile.js";
export * from "./sample.js";
