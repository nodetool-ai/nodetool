/**
 * Public surface for the shared GPU library.
 *
 * Consumers should import shader registry APIs and helpers from this module:
 *
 *   import { getShader, listShaders } from "@/lib/gpu";
 *
 * Direct imports from `./shaders/*` are reserved for the catalog itself.
 */

export {
  getShader,
  listShaders,
  type ShaderKind,
  type ShaderCategory,
  type ShaderSurface,
  type ShaderVariant,
  type ShaderScope,
  type ShaderModule,
  type ListShadersFilter,
} from "./registry";

export * from "./helpers";
