/**
 * Shared GPU shader registry.
 *
 * Phase 1 design notes:
 * - Shader modules are registered explicitly via the `ALL_SHADERS` array in
 *   `./shaders/index.ts`. We intentionally avoid `import.meta.glob` so the
 *   bundle graph is statically analysable and the catalog is greppable.
 * - Snippets (pure WGSL string fragments meant to be composed into other
 *   shaders) export plain strings from their files and are NOT required to
 *   appear in `listShaders()`.
 * - `colorSpace` and `alphaMode` are descriptive in Phase 1; no automatic
 *   conversion happens. Consumers may use these hints to decide how to feed
 *   data into / read data out of a pass.
 */

import { ALL_SHADERS } from "./shaders";

/**
 * What kind of pipeline this shader is intended to drive.
 * - `render`: classic render pipeline (vertex + fragment)
 * - `compute`: compute pipeline
 * - `snippet`: a reusable WGSL fragment, not a complete shader on its own
 */
export type ShaderKind = "render" | "compute" | "snippet";

/**
 * Coarse functional grouping. Mirrors the folder layout under `./shaders/`.
 */
export type ShaderCategory =
  | "utils"
  | "mixer"
  | "background"
  | "overlay";

/**
 * Which surface / target the shader is designed to write to.
 * - `canvas`: an on-screen `GPUCanvasContext` surface
 * - `texture`: an off-screen `GPUTexture` (e.g. accumulation / ping-pong)
 * - `buffer`: writes into a storage buffer (compute)
 */
export type ShaderSurface = "canvas" | "texture" | "buffer";

/**
 * Variant of the shader. Allows multiple specializations of the same
 * conceptual shader (e.g. fast path vs. full blend modes) to live in the
 * registry without colliding.
 */
export type ShaderVariant = "default" | "fast" | "full" | string;

/**
 * Where the shader is allowed to be used.
 * - `shared`: any feature may use it
 * - `sketch`: scoped to the sketch / canvas drawing subsystem
 * - `timeline`: scoped to the timeline video preview subsystem
 */
export type ShaderScope = "shared" | "sketch" | "timeline";

/**
 * A single registered shader module.
 *
 * `id` is the registry key and must be globally unique across `ALL_SHADERS`.
 * Convention: `"<category>/<name>"` or `"<category>/<name>:<variant>"`.
 */
export interface ShaderModule {
  /** Globally unique registry id. */
  id: string;
  /** Human-readable name; defaults conceptually to `id` if omitted by caller. */
  name: string;
  kind: ShaderKind;
  category: ShaderCategory;
  surface: ShaderSurface;
  variant: ShaderVariant;
  scope: ShaderScope;
  /** The WGSL source for this shader. For snippets this is the fragment text. */
  source: string;
  /**
   * Descriptive color space the shader expects / produces. Phase 1: hint only,
   * no automatic conversion is performed by the registry or helpers.
   */
  colorSpace?: "srgb" | "linear" | "display-p3";
  /**
   * Descriptive alpha handling. Phase 1: hint only.
   */
  alphaMode?: "straight" | "premultiplied" | "opaque";
  /** Optional free-form description for catalog / tooling. */
  description?: string;
  /** Optional tags for ad-hoc filtering. */
  tags?: readonly string[];
}

/**
 * Filter passed to `listShaders`. All fields are optional and combined with AND.
 */
export interface ListShadersFilter {
  kind?: ShaderKind;
  category?: ShaderCategory;
  surface?: ShaderSurface;
  variant?: ShaderVariant;
  scope?: ShaderScope;
}

/**
 * Look up a shader module by id. Throws if no such shader is registered.
 */
export function getShader(id: string): ShaderModule {
  for (const shader of ALL_SHADERS) {
    if (shader.id === id) return shader;
  }
  throw new Error(`getShader: no shader registered with id "${id}"`);
}

/**
 * List all registered shaders, optionally filtered. Returns a fresh array.
 */
export function listShaders(filter?: ListShadersFilter): ShaderModule[] {
  if (!filter) return [...ALL_SHADERS];
  return ALL_SHADERS.filter((shader) => {
    if (filter.kind && shader.kind !== filter.kind) return false;
    if (filter.category && shader.category !== filter.category) return false;
    if (filter.surface && shader.surface !== filter.surface) return false;
    if (filter.variant && shader.variant !== filter.variant) return false;
    if (filter.scope && shader.scope !== filter.scope) return false;
    return true;
  });
}
