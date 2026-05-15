/**
 * Public surface of `web/src/lib/gpu`.
 *
 * Re-exports the registry API and the helpers barrel.
 */

export {
  type ShaderKind,
  type ShaderCategory,
  type ShaderSurface,
  type ShaderVariant,
  type ShaderScope,
  type ShaderModule,
  type ShaderFilter,
  getShader,
  listShaders,
} from "./registry.js";

export * from "./helpers/index.js";
