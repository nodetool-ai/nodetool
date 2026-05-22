/**
 * @nodetool-ai/gpu/pool — TypeGPU-backed shader pool (Phase 1).
 *
 * The shared GPU operation catalog with a tiny runtime: `ShaderModule`
 * (WGSL + typed bind group layout + typed uniform schema + sampler config +
 * I/O contract), `LabeledTexture`, the `GPUContext` adapter, the registry,
 * and the small `Executor`. All TypeGPU-backed.
 *
 * Kept out of the package's pure root so that Node consumers of the blend
 * catalog don't pull in TypeGPU. This entry is device-agnostic — the same
 * module code runs against browser, Electron, and Node.js Dawn devices. The
 * `navigator.gpu` adapter (`createBrowserGPUContext`) lives behind `./webgpu`.
 */

export * from "./types.js";
export * from "./module.js";
export * from "./texture.js";
export * from "./registry.js";
export * from "./executor.js";
export * from "./fullscreenQuad.js";
export {
  ceilToBucket,
  makeScratchPool,
  createGPUContextFromDevice
} from "./context.js";
export type {
  GPUContext,
  GPUCapabilities,
  PipelineCache,
  CachedPipeline,
  ScratchPool,
  ScratchSpec
} from "./context.js";
export {
  ALL_SHADERS,
  passthroughV1,
  colorGradeV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1
} from "./shaders/index.js";

import { ShaderRegistry } from "./registry.js";
import { ALL_SHADERS } from "./shaders/index.js";

/** A {@link ShaderRegistry} preloaded with every catalog module. */
export function createDefaultRegistry(): ShaderRegistry {
  const registry = new ShaderRegistry();
  registry.registerAll(ALL_SHADERS);
  return registry;
}
